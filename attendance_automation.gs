/* ===== 勤怠管理自動化スクリプト =====
   概要:
   - 毎月月初 0:00 に前月 Google カレンダー → 「○月イベント一覧」へ自動取込
   - TRUE の行だけを集計して「○月勤務実績」シートを生成
   - 勤務チェック列はチェックボックス。短い重複イベントは自動 FALSE
   - 最終行 A列に "OK" と入力すると即時で勤怠シートを再生成
   ------------------------------------------------------------------ */

/** ★★★ ここを自分のカレンダー ID に変更 ★★★ */
const CALENDAR_ID = 'primary'; // 例: 'primary' や 'xxxxx@group.calendar.google.com'
// カレンダーIDの確認方法:
// 1. Googleカレンダーを開く
// 2. 左側のカレンダーの「⋮」→「設定と共有」
// 3. 「カレンダーの統合」→「カレンダーID」を確認

/* ---------------- 共通ユーティリティ ---------------- */
function getMonthLabel(offset) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return (t.getMonth() + 1) + '月';
}

function getMonthRange(monthLabel) {
  const m = parseInt(monthLabel.replace('月', ''), 10) - 1;
  if (isNaN(m)) throw new Error('monthLabel には "5月" のように "月" を含む文字列を渡してください');
  const now = new Date();
  let y = now.getFullYear();
  if (m > now.getMonth()) y -= 1;
  return [new Date(y, m, 1, 0, 0, 0), new Date(y, m + 1, 1, 0, 0, 0)];
}

/* ───────── ① Google カレンダー → イベント一覧 ───────── */
function importCalendarEvents(monthLabel) {
  if (!monthLabel) monthLabel = getMonthLabel(0);
  if (typeof monthLabel !== 'string') throw new Error('monthLabel は文字列で指定してください');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  let sheet = ss.getSheetByName(monthLabel + 'イベント一覧');
  if (!sheet) sheet = ss.insertSheet(monthLabel + 'イベント一覧');
  
  sheet.clear();
  sheet.appendRow(['日付', '開始時刻', '終了時刻', 'タイトル']);
  
  const [start, end] = getMonthRange(monthLabel);
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) { 
    SpreadsheetApp.getUi().alert('カレンダー ID が見つかりません: ' + CALENDAR_ID); 
    return; 
  }
  
  const events = cal.getEvents(start, end);
  const rows = [];
  
  events.forEach(ev => {
    rows.push([
      Utilities.formatDate(ev.getStartTime(), tz, 'yyyy/MM/dd'),
      Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm'),
      Utilities.formatDate(ev.getEndTime(),   tz, 'HH:mm'),
      ev.getTitle()
    ]);
  });
  
  if (rows.length === 0) {
    sheet.appendRow(['(この月のイベントはありません)']);
  } else {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  addConfirmationRow(sheet);
}

/* ───────── ② 月次トリガー ───────── */
function createMonthlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runMonthlyBatch') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runMonthlyBatch')
    .timeBased()
    .onMonthDay(1)
    .atHour(0)
    .nearMinute(0)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

function runMonthlyBatch() {
  const prev = getMonthLabel(-1);
  importCalendarEvents(prev);
  updateAttendanceData(prev);
}

/* ───────── ③ OK 行 ───────── */
function addConfirmationRow(sheet) {
  const msg = '←勤務時間チェックが終わったらA列のこのセルに"OK"と入力してください';
  const lastRow = sheet.getLastRow();
  if (sheet.getRange(lastRow, 2).getValue() !== msg) {
    sheet.appendRow(['', msg]);
  }
}

/* ───────── ④ 勤務チェック自動更新 ───────── */
function applyCheckMarks(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  
  const tz = Session.getScriptTimeZone();
  const CHECK_COL = 6;
  const existing = sheet.getRange(2, CHECK_COL + 1, data.length - 1, 1).getValues();
  const updated = existing.map(v => [v[0]]);
  const perDate = {};
  
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row[0]) continue;
    
    const key = Utilities.formatDate(new Date(row[0]), tz, 'yyyy-MM-dd');
    let s = row[1], e = row[2];
    if (!s || !e) continue;
    
    if (s instanceof Date) s = Utilities.formatDate(s, tz, 'HH:mm');
    if (e instanceof Date) e = Utilities.formatDate(e, tz, 'HH:mm');
    
    const [sh, sm] = String(s).split(':').map(Number);
    const [eh, em] = String(e).split(':').map(Number);
    if ([sh, sm, eh, em].some(isNaN)) continue;
    
    let sMin = sh * 60 + sm, eMin = eh * 60 + em;
    if (eMin < sMin) eMin += 24 * 60;
    
    if (!perDate[key]) perDate[key] = [];
    perDate[key].push({ row: r + 1, s: sMin, e: eMin, dur: eMin - sMin });
  }
  
  for (const key in perDate) {
    const list = perDate[key].sort((a, b) => b.dur - a.dur);
    const accepted = [];
    
    list.forEach(ev => {
      const idx = ev.row - 2;
      const overlap = accepted.some(ac => !(ev.e <= ac.s || ev.s >= ac.e));
      
      if (!overlap) {
        if (existing[idx][0] !== false) updated[idx][0] = true;
        accepted.push({ s: ev.s, e: ev.e });
      } else {
        updated[idx][0] = false;
      }
    });
  }
  
  sheet.getRange(2, CHECK_COL + 1, updated.length, 1).setValues(updated);
}

/* ───────── ⑤ 勤怠シート生成 ───────── */
function updateAttendanceData(label) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(label + 'イベント一覧');
  if (!src) { 
    SpreadsheetApp.getUi().alert('シートが見つかりません: ' + label + 'イベント一覧'); 
    return; 
  }
  
  addConfirmationRow(src);
  
  let dst = ss.getSheetByName(label + '勤務実績');
  if (!dst) dst = ss.insertSheet(label + '勤務実績');
  dst.clear();
  dst.appendRow(['日付', 'タイトル', '開始時刻', '終了時刻', '勤務時間(分)', '勤務時間(時間)']);
  
  const data = src.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();
  let total = 0;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // 勤務チェック列がなくなったので全行対象
    // if (row[6] !== true) continue;
    let s = row[1], e = row[2];
    if (s instanceof Date) s = Utilities.formatDate(s, tz, 'HH:mm');
    if (e instanceof Date) e = Utilities.formatDate(e, tz, 'HH:mm');
    const [sh, sm] = String(s).split(':').map(Number);
    const [eh, em] = String(e).split(':').map(Number);
    if ([sh, sm, eh, em].some(isNaN)) continue;
    let sMin = sh * 60 + sm, eMin = eh * 60 + em;
    if (eMin < sMin) eMin += 24 * 60;
    const duration = eMin - sMin;
    total += duration;
    const hours = (duration / 60).toFixed(2);
    dst.appendRow([
      row[0],      // 日付
      row[3],      // タイトル（4列目）
      s,
      e,
      duration,
      hours
    ]);
  }
  
  // 合計行を追加
  dst.appendRow(['', '合計', '', '', total, (total / 60).toFixed(2)]);
  
  // フォーマットを適用
  formatAttendanceSheet(dst);
}

/* ───────── ⑥ シートフォーマット ───────── */
function formatAttendanceSheet(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  // ヘッダー行のフォーマット
  sheet.getRange(1, 1, 1, lastCol).setFontWeight('bold');
  sheet.getRange(1, 1, 1, lastCol).setBackground('#4285f4');
  sheet.getRange(1, 1, 1, lastCol).setFontColor('white');
  
  // 合計行のフォーマット
  if (lastRow > 1) {
    sheet.getRange(lastRow, 1, 1, lastCol).setFontWeight('bold');
    sheet.getRange(lastRow, 1, 1, lastCol).setBackground('#f4b400');
  }
  
  // 列幅の自動調整
  sheet.autoResizeColumns(1, lastCol);
  
  // 罫線を追加
  sheet.getRange(1, 1, lastRow, lastCol).setBorder(true, true, true, true, true, true);
}

/* ───────── ⑦ 手動実行用関数 ───────── */
function manualImport() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '月を指定してください',
    '例: 5月 または 前月の場合は -1',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const input = response.getResponseText().trim();
    let monthLabel;
    
    if (input === '-1') {
      monthLabel = getMonthLabel(-1);
    } else if (input.includes('月')) {
      monthLabel = input;
    } else {
      ui.alert('正しい形式で入力してください（例: 5月 または -1）');
      return;
    }
    
    try {
      importCalendarEvents(monthLabel);
      updateAttendanceData(monthLabel);
      ui.alert('完了しました: ' + monthLabel);
    } catch (error) {
      ui.alert('エラーが発生しました: ' + error.message);
    }
  }
}

/* ───────── ⑧ 初期設定関数 ───────── */
function setupAttendanceSystem() {
  const ui = SpreadsheetApp.getUi();
  
  // カレンダーIDの確認
  if (CALENDAR_ID === 'primary') {
    const response = ui.alert(
      'カレンダーIDの確認',
      '現在のカレンダーIDは "primary" に設定されています。\n' +
      '特定のカレンダーを使用する場合は、スクリプト内の CALENDAR_ID を変更してください。\n\n' +
      '続行しますか？',
      ui.ButtonSet.YES_NO
    );
    
    if (response !== ui.Button.YES) return;
  }
  
  // 月次トリガーの設定
  createMonthlyTrigger();
  
  // 現在の月のデータをインポート
  const currentMonth = getMonthLabel(0);
  importCalendarEvents(currentMonth);
  updateAttendanceData(currentMonth);
  
  ui.alert('初期設定が完了しました！\n\n' +
           '・月次トリガーが設定されました\n' +
           '・' + currentMonth + 'のデータがインポートされました\n\n' +
           '毎月1日0時に前月のデータが自動でインポートされます。');
}

/* ───────── ⑨ トリガー削除関数 ───────── */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'runMonthlyBatch') {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  });
  
  SpreadsheetApp.getUi().alert(count + '個のトリガーを削除しました。');
}

/* ───────── ⑩ メニュー作成 ───────── */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('勤怠管理')
    .addItem('初期設定', 'setupAttendanceSystem')
    .addItem('手動インポート', 'manualImport')
    .addSeparator()
    .addItem('トリガー削除', 'removeTriggers')
    .addToUi();
}

/* ───────── ⑪ テスト用関数 ───────── */
function testManualImport() {
  // 直接7月のデータを取込
  const monthLabel = '7月';
  try {
    console.log('開始: ' + monthLabel + 'のデータ取込');
    importCalendarEvents(monthLabel);
    console.log('イベント一覧作成完了');
    updateAttendanceData(monthLabel);
    console.log('勤務実績作成完了');
    console.log('完了しました: ' + monthLabel);
  } catch (error) {
    console.error('エラーが発生しました: ' + error.message);
    console.error('エラーの詳細: ' + error.stack);
  }
}

/* ───────── ⑫ デバッグ用関数 ───────── */
function debugUpdateAttendance() {
  const monthLabel = '7月';
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const src = ss.getSheetByName(monthLabel + 'イベント一覧');
    
    if (!src) {
      console.error('イベント一覧シートが見つかりません: ' + monthLabel + 'イベント一覧');
      return;
    }
    
    console.log('イベント一覧シートを発見: ' + src.getName());
    console.log('データ行数: ' + src.getLastRow());
    
    updateAttendanceData(monthLabel);
    console.log('勤務実績シート作成完了');
    
  } catch (error) {
    console.error('デバッグエラー: ' + error.message);
  }
}

/* ───────── ⑬ カレンダーデバッグ関数 ───────── */
function debugCalendar() {
  const monthLabel = '7月';
  try {
    console.log('=== カレンダーデバッグ開始 ===');
    console.log('カレンダーID: ' + CALENDAR_ID);
    
    const [start, end] = getMonthRange(monthLabel);
    console.log('検索期間: ' + start + ' から ' + end);
    
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) {
      console.error('カレンダーが見つかりません: ' + CALENDAR_ID);
      return;
    }
    
    console.log('カレンダー名: ' + cal.getName());
    
    const events = cal.getEvents(start, end);
    console.log('イベント数: ' + events.length);
    
    if (events.length === 0) {
      console.log('7月のイベントが見つかりませんでした');
      console.log('カレンダーにイベントが存在するか確認してください');
    } else {
      console.log('=== イベント一覧 ===');
      events.forEach((ev, index) => {
        console.log((index + 1) + '. ' + ev.getTitle() + ' (' + ev.getStartTime() + ' - ' + ev.getEndTime() + ')');
      });
    }
    
    console.log('=== カレンダーデバッグ完了 ===');
    
  } catch (error) {
    console.error('カレンダーデバッグエラー: ' + error.message);
  }
} 