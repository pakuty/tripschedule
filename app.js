/**
 * 日程管理アプリ - アプリケーションロジック (最寄り駅・乗降車駅・乗り場対応版)
 */

// --- 画面上エラー検知 ---
window.addEventListener('error', function(e) {
  let errBox = document.getElementById('debug-error-banner');
  if (!errBox) {
    errBox = document.createElement('div');
    errBox.id = 'debug-error-banner';
    errBox.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#D93829;color:#fff;padding:10px;font-size:12px;z-index:9999;word-break:break-all;';
    document.body.appendChild(errBox);
  }
  errBox.textContent = 'エラーが発生しました: ' + (e.message || e);
});

// --- 安全なストレージラッパー ---
let inMemoryStore = {};
const safeStorage = {
  getItem: function(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('localStorage read error, using in-memory store', e);
    }
    return inMemoryStore[key] || null;
  },
  setItem: function(key, val) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, val);
      }
    } catch (e) {
      console.warn('localStorage write error, using in-memory store', e);
    }
    inMemoryStore[key] = val;
  }
};

// --- 初期データ ---
function getInitialTodayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const CLEAN_DEFAULT_DAYS = [
  {
    id: 'day-initial',
    date: getInitialTodayDate(),
    currentSpotIndex: 0,
    items: []
  }
];

// --- アプリケーション状態 ---
let state = {
  days: [],
  todayIndex: 0,
  scheduleViewDayIndex: 0, // しおり画面で現在表示中の日程インデックス
  pastViewDayIndex: 0,
  activeView: 'schedule',
  selectedActionItem: null
};

// --- ストレージ読み書き ---
const STORAGE_KEY_DAYS = 'schedule_app_days_v6';
const STORAGE_KEY_TODAY_IDX = 'schedule_app_today_idx_v6';

function loadState() {
  try {
    const savedDays = safeStorage.getItem(STORAGE_KEY_DAYS);
    const savedTodayIdx = safeStorage.getItem(STORAGE_KEY_TODAY_IDX);

    state.days = savedDays ? JSON.parse(savedDays) : JSON.parse(JSON.stringify(CLEAN_DEFAULT_DAYS));
    state.todayIndex = savedTodayIdx !== null ? parseInt(savedTodayIdx, 10) : 0;
    state.scheduleViewDayIndex = state.todayIndex;
    state.pastViewDayIndex = 0;
  } catch (e) {
    state.days = JSON.parse(JSON.stringify(CLEAN_DEFAULT_DAYS));
    state.todayIndex = 0;
    state.pastViewDayIndex = 0;
  }
}

function saveState() {
  try {
    safeStorage.setItem(STORAGE_KEY_DAYS, JSON.stringify(state.days));
    safeStorage.setItem(STORAGE_KEY_TODAY_IDX, state.todayIndex.toString());
  } catch (e) {
    console.warn('saveState error', e);
  }
}

function getTodayDay() {
  if (!state.days || state.days.length === 0) {
    state.days = JSON.parse(JSON.stringify(CLEAN_DEFAULT_DAYS));
  }
  if (state.todayIndex >= state.days.length) {
    state.todayIndex = 0;
  }
  return state.days[state.todayIndex];
}

// しおり画面で現在選択・表示中の日程を取得
function getCurrentScheduleDay() {
  if (!state.days || state.days.length === 0) {
    state.days = JSON.parse(JSON.stringify(CLEAN_DEFAULT_DAYS));
  }
  if (state.scheduleViewDayIndex < 0 || state.scheduleViewDayIndex >= state.days.length) {
    state.scheduleViewDayIndex = Math.min(Math.max(0, state.todayIndex), state.days.length - 1);
  }
  return state.days[state.scheduleViewDayIndex];
}

// --- 時刻・日付ユーティリティ ---
function parseTimeToMinutes(timeStr) {
  return getMinutesFromTimeString(timeStr);
}

function getMinutesFromTimeString(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function formatMinutesToTimeString(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateWithWeekday(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const w = WEEKDAYS[d.getDay()];
    return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日(${w})`;
  }
  return dateStr;
}

function getDayDiffFromToday(dateStr) {
  if (!dateStr) return 0;
  const todayStr = getInitialTodayDate();
  const d1 = new Date(dateStr.replace(/-/g, '/'));
  const d2 = new Date(todayStr.replace(/-/g, '/'));
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function getRelativeDayBadgeInfo(dateStr) {
  const diff = getDayDiffFromToday(dateStr);
  if (diff === 0) return { text: '本日', className: 'badge-today' };
  if (diff === 1) return { text: '明日', className: 'badge-tomorrow' };
  if (diff === 2) return { text: '明後日', className: 'badge-day-after' };
  if (diff > 2) return { text: `${diff}日後`, className: 'badge-future' };
  if (diff === -1) return { text: '昨日', className: 'badge-past' };
  return { text: `${Math.abs(diff)}日前`, className: 'badge-past' };
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
  }
  return dateStr;
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[0]}年${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
  }
  return dateStr;
}

// --- DOM 初期化 ---
function initApp() {
  const dom = {
    headerDateSub: document.getElementById('header-date-sub'),
    headerClock: document.getElementById('header-clock'),
    navButtons: document.querySelectorAll('.nav-button'),
    viewPanels: {
      'schedule': document.getElementById('view-schedule'),
      'now-next': document.getElementById('view-now-next'),
      'undecided': document.getElementById('view-undecided')
    },
    
    // しおり画面（日程ナビゲーション & アクション）
    btnSchedulePrev: document.getElementById('btn-schedule-prev'),
    scheduleDayBadge: document.getElementById('schedule-day-badge'),
    selectScheduleDay: document.getElementById('select-schedule-day'),
    btnScheduleNext: document.getElementById('btn-schedule-next'),
    btnOpenAddDaySchedule: document.getElementById('btn-open-add-day-schedule'),
    btnOpenEditDay: document.getElementById('btn-open-edit-day'),
    mainDayLabel: document.getElementById('main-day-label'),
    mainDaySpotsCount: document.getElementById('main-day-spots-count'),
    scheduleList: document.getElementById('schedule-list'),
    btnOpenAddSchedule: document.getElementById('btn-open-add-schedule'),

    // いま・つぎ 画面
    timingStatusCard: document.getElementById('timing-status-card'),
    timingLabel: document.getElementById('timing-label'),
    timingMessage: document.getElementById('timing-message'),
    nowSpotBadge: document.getElementById('now-spot-badge'),
    nowSpotTitle: document.getElementById('now-spot-title'),
    nowSpotSub: document.getElementById('now-spot-sub'),
    nowSpotTime: document.getElementById('now-spot-time'),
    nowSpotMemo: document.getElementById('now-spot-memo'),
    nextSpotBadge: document.getElementById('next-spot-badge'),
    nextSpotTitle: document.getElementById('next-spot-title'),
    nextSpotSub: document.getElementById('next-spot-sub'),
    nextSpotTime: document.getElementById('next-spot-time'),
    nextSpotMemo: document.getElementById('next-spot-memo'),
    btnNextAction: document.getElementById('btn-next-action'),

    // 過去のしおり 画面
    btnPastPrev: document.getElementById('btn-past-prev'),
    btnPastNext: document.getElementById('btn-past-next'),
    selectPastDay: document.getElementById('select-past-day'),
    pastDayScheduleList: document.getElementById('past-day-schedule-list'),
    btnOpenAddDay: document.getElementById('btn-open-add-day'),

    // 予定タップ ポップアップ
    modalSpotAction: document.getElementById('modal-spot-action'),
    spotActionName: document.getElementById('spot-action-name'),
    spotActionTime: document.getElementById('spot-action-time'),
    btnCloseSpotAction: document.getElementById('btn-close-spot-action'),
    btnSetAsCurrent: document.getElementById('btn-set-as-current'),
    btnOpenEditContent: document.getElementById('btn-open-edit-content'),
    btnDeleteFromAction: document.getElementById('btn-delete-from-action'),

    // 予定追加モーダル
    modalEditItem: document.getElementById('modal-edit-item'),
    modalTitle: document.getElementById('modal-title'),
    scheduleForm: document.getElementById('schedule-form'),
    formItemId: document.getElementById('form-item-id'),
    radioTypeSpot: document.getElementById('radio-type-spot'),
    radioTypeTransit: document.getElementById('radio-type-transit'),
    fieldSpotContainer: document.getElementById('field-spot-container'),
    fieldTransitContainer: document.getElementById('field-transit-container'),
    formTitle: document.getElementById('form-title'),
    formNearestStation: document.getElementById('form-nearest-station'),
    formDepartureStation: document.getElementById('form-departure-station'),
    formArrivalStation: document.getElementById('form-arrival-station'),
    formTransitPlatform: document.getElementById('form-transit-platform'),
    formTransitLine: document.getElementById('form-transit-line'),
    labelStartTime: document.getElementById('label-start-time'),
    formStartTime: document.getElementById('form-start-time'),
    labelEndTime: document.getElementById('label-end-time'),
    formEndTime: document.getElementById('form-end-time'),
    formMemo: document.getElementById('form-memo'),
    btnDeleteItem: document.getElementById('btn-delete-item'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),

    // 日程追加モーダル
    modalAddDay: document.getElementById('modal-add-day'),
    dayForm: document.getElementById('day-form'),
    newDayDate: document.getElementById('new-day-date'),
    btnCloseDayModal: document.getElementById('btn-close-day-modal'),
    btnCancelDayModal: document.getElementById('btn-cancel-day-modal'),

    // 日程変更・削除モーダル
    modalEditDay: document.getElementById('modal-edit-day'),
    editDayForm: document.getElementById('edit-day-form'),
    editDayDate: document.getElementById('edit-day-date'),
    btnDeleteDay: document.getElementById('btn-delete-day'),
    btnCloseEditDayModal: document.getElementById('btn-close-edit-day-modal'),
    btnCancelEditDayModal: document.getElementById('btn-cancel-edit-day-modal')
  };

  function switchView(viewName) {
    state.activeView = viewName;
    
    dom.navButtons.forEach(btn => {
      if (btn.dataset.view === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    Object.keys(dom.viewPanels).forEach(key => {
      if (key === viewName) {
        dom.viewPanels[key].classList.add('active');
      } else {
        dom.viewPanels[key].classList.remove('active');
      }
    });

    render();
  }

  function render() {
    renderClock();
    renderSchedule();
    renderNowNext();
    renderPastSchedule();
  }

  function renderClock() {
    const currentMin = getCurrentMinutes();
    const timeStr = formatMinutesToTimeString(currentMin);
    dom.headerClock.textContent = timeStr;

    const today = getTodayDay();
    dom.headerDateSub.textContent = formatFullDate(today.date);
  }

  // 時間が重複している予定のID一覧を取得
  function getOverlappingItemIds(items) {
    const overlappingIds = new Set();
    if (!items || items.length < 2) return overlappingIds;

    for (let i = 0; i < items.length; i++) {
      const itemA = items[i];
      const startA = getMinutesFromTimeString(itemA.startTime);
      const endA = itemA.endTime ? getMinutesFromTimeString(itemA.endTime) : startA + 60;

      for (let j = i + 1; j < items.length; j++) {
        const itemB = items[j];
        const startB = getMinutesFromTimeString(itemB.startTime);
        const endB = itemB.endTime ? getMinutesFromTimeString(itemB.endTime) : startB + 60;

        if (startA < endB && startB < endA) {
          overlappingIds.add(itemA.id);
          overlappingIds.add(itemB.id);
        }
      }
    }
    return overlappingIds;
  }

  // カードのHTML生成ヘルパー
  function createScheduleCardHtml(item, isOverlapping) {
    const timeRange = item.endTime ? `${item.startTime} 〜 ${item.endTime}` : item.startTime;
    const typeBadge = item.type === 'transit'
      ? '<span class="type-badge badge-transit">移動</span>'
      : '<span class="type-badge badge-spot">場所</span>';

    let contentHtml = '';
    if (item.type === 'transit') {
      // 交通機関：乗車駅と降車駅の両方がはっきり見える表示
      const dep = escapeHtml(item.departureStation || '未設定');
      const arr = escapeHtml(item.arrivalStation || '未設定');
      const platformHtml = item.platform ? `<span class="platform-badge">${escapeHtml(item.platform)}</span>` : '';
      const lineHtml = item.transitLine ? `<span>${escapeHtml(item.transitLine)}</span>` : '';

      contentHtml = `
        <div class="schedule-stations-row">
          <span class="station-badge">${dep}</span>
          <span class="station-arrow">&rarr;</span>
          <span class="station-badge">${arr}</span>
        </div>
        ${(platformHtml || lineHtml) ? `<div class="transit-sub-row">${platformHtml} ${lineHtml}</div>` : ''}
      `;
    } else {
      // 場所：予定名 + 最寄り駅
      const title = escapeHtml(item.title || '予定');
      const nearestHtml = item.nearestStation ? `<div class="nearest-badge">最寄り: ${escapeHtml(item.nearestStation)}</div>` : '';

      contentHtml = `
        <div class="schedule-title">${title}</div>
        ${nearestHtml}
      `;
    }

    const overlapBadge = isOverlapping ? '<span class="overlap-badge">時間が重複</span>' : '';

    return `
      <div class="card-top-row">
        <div style="display: flex; align-items: center; gap: 6px;">
          ${typeBadge}
          ${overlapBadge}
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="schedule-time">${timeRange}</span>
          <div class="drag-grip-icon" title="長押しで移動">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
      ${contentHtml}
      ${item.memo ? `<div class="schedule-memo">${escapeHtml(item.memo)}</div>` : ''}
    `;
  }

  function renderSchedule() {
    const currentDay = getCurrentScheduleDay();
    const items = currentDay.items || [];

    // 1. 日程プルダウンの選択肢を全日程で再生成
    if (dom.selectScheduleDay) {
      dom.selectScheduleDay.innerHTML = '';
      state.days.forEach((day, idx) => {
        const opt = document.createElement('option');
        opt.value = idx.toString();
        const badgeInfo = getRelativeDayBadgeInfo(day.date);
        const count = day.items ? day.items.length : 0;
        opt.textContent = `${formatDateWithWeekday(day.date)} [${badgeInfo.text}] (${count}件)`;
        if (idx === state.scheduleViewDayIndex) {
          opt.selected = true;
        }
        dom.selectScheduleDay.appendChild(opt);
      });
    }

    // 2. 前後ボタンの活性・非活性制御
    if (dom.btnSchedulePrev) {
      dom.btnSchedulePrev.disabled = (state.scheduleViewDayIndex <= 0);
      dom.btnSchedulePrev.style.opacity = (state.scheduleViewDayIndex <= 0) ? '0.3' : '1';
    }
    if (dom.btnScheduleNext) {
      dom.btnScheduleNext.disabled = (state.scheduleViewDayIndex >= state.days.length - 1);
      dom.btnScheduleNext.style.opacity = (state.scheduleViewDayIndex >= state.days.length - 1) ? '0.3' : '1';
    }

    // 3. 相対関係バッジ（本日、明日、明後日など）
    if (dom.scheduleDayBadge) {
      const badgeInfo = getRelativeDayBadgeInfo(currentDay.date);
      dom.scheduleDayBadge.textContent = badgeInfo.text;
      dom.scheduleDayBadge.className = `day-rel-badge ${badgeInfo.className}`;
    }

    // 4. 日付詳細ラベルと予定件数
    dom.mainDayLabel.textContent = formatDateWithWeekday(currentDay.date);
    dom.mainDaySpotsCount.textContent = `${items.length}件の予定`;

    // 5. 予定カード一覧の描画
    dom.scheduleList.innerHTML = '';

    if (items.length === 0) {
      dom.scheduleList.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #8C939E; font-size: 13px;">
          この日の予定はまだありません。<br>右上の「+ 予定を追加」から登録してください。
        </div>
      `;
      return;
    }

    const overlappingIds = getOverlappingItemIds(items);

    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'schedule-card';

      if (item.type === 'transit') {
        card.classList.add('is-transit');
      }

      // 「本日」を表示している場合のみ、現在スポットや過去スポットのスタイルを適用
      const isCurrent = (state.scheduleViewDayIndex === state.todayIndex && index === currentDay.currentSpotIndex);
      const isPast = (state.scheduleViewDayIndex === state.todayIndex && index < currentDay.currentSpotIndex);
      const isOverlapping = overlappingIds.has(item.id);

      if (isCurrent) {
        card.classList.add('is-current');
      } else if (isPast) {
        card.classList.add('is-past');
      }

      if (isOverlapping) {
        card.classList.add('is-overlapping');
      }

      card.innerHTML = createScheduleCardHtml(item, isOverlapping);

      // 長押しドラッグ＆ドロップ並び替えの登録
      setupCardDragAndDrop(card, index, state.scheduleViewDayIndex, dom.scheduleList);

      card.addEventListener('click', () => {
        if (card._didDrag) {
          card._didDrag = false;
          return;
        }
        openSpotActionPopup(item, index, state.scheduleViewDayIndex);
      });

      dom.scheduleList.appendChild(card);
    });
  }

  function renderNowNext() {
    const currentMin = getCurrentMinutes();
    const today = getTodayDay();
    const items = today.items || [];
    const currIdx = today.currentSpotIndex || 0;

    const currentSpot = items[currIdx] || null;
    const nextSpot = items[currIdx + 1] || null;

    // 1. いまどこにいるか
    if (currentSpot) {
      if (currentSpot.type === 'transit') {
        dom.nowSpotTitle.textContent = `${currentSpot.departureStation || ''} → ${currentSpot.arrivalStation || ''}`;
        const subParts = [];
        if (currentSpot.platform) subParts.push(currentSpot.platform);
        if (currentSpot.transitLine) subParts.push(currentSpot.transitLine);
        dom.nowSpotSub.textContent = subParts.join(' / ');
        dom.nowSpotBadge.className = 'type-badge badge-transit';
        dom.nowSpotBadge.textContent = '交通機関・移動中';
      } else {
        dom.nowSpotTitle.textContent = currentSpot.title;
        dom.nowSpotSub.textContent = currentSpot.nearestStation ? `最寄り: ${currentSpot.nearestStation}` : '';
        dom.nowSpotBadge.className = 'type-badge badge-spot';
        dom.nowSpotBadge.textContent = '滞在中スポット';
      }

      dom.nowSpotTime.textContent = currentSpot.endTime 
        ? `${currentSpot.startTime} 〜 ${currentSpot.endTime}` 
        : `${currentSpot.startTime} 開始`;
      dom.nowSpotMemo.textContent = currentSpot.memo || 'メモなし';
    } else {
      dom.nowSpotTitle.textContent = '予定がありません';
      dom.nowSpotSub.textContent = '';
      dom.nowSpotTime.textContent = '--:-- 〜 --:--';
      dom.nowSpotMemo.textContent = 'しおりから予定を追加してください';
      dom.nowSpotBadge.className = 'type-badge badge-spot';
      dom.nowSpotBadge.textContent = '待機中';
    }

    // 2. 次の予定
    if (nextSpot) {
      if (nextSpot.type === 'transit') {
        dom.nextSpotTitle.textContent = `${nextSpot.departureStation || ''} → ${nextSpot.arrivalStation || ''}`;
        const subParts = [];
        if (nextSpot.platform) subParts.push(nextSpot.platform);
        if (nextSpot.transitLine) subParts.push(nextSpot.transitLine);
        dom.nextSpotSub.textContent = subParts.join(' / ');
        dom.nextSpotBadge.className = 'type-badge badge-transit';
        dom.nextSpotBadge.textContent = '次の移動';
      } else {
        dom.nextSpotTitle.textContent = nextSpot.title;
        dom.nextSpotSub.textContent = nextSpot.nearestStation ? `最寄り: ${nextSpot.nearestStation}` : '';
        dom.nextSpotBadge.className = 'type-badge badge-spot';
        dom.nextSpotBadge.textContent = '次の目的地';
      }

      dom.nextSpotTime.textContent = `${nextSpot.startTime} 開始予定`;
      dom.nextSpotMemo.textContent = nextSpot.memo || '';
      dom.btnNextAction.style.display = 'flex';
      dom.btnNextAction.querySelector('span').textContent = `「${dom.nextSpotTitle.textContent}」へ移動・次へ`;
    } else {
      dom.nextSpotTitle.textContent = '次の予定はありません';
      dom.nextSpotSub.textContent = '';
      dom.nextSpotTime.textContent = '--:--';
      dom.nextSpotMemo.textContent = '';
      dom.btnNextAction.style.display = 'none';
      dom.nextSpotBadge.className = 'type-badge badge-spot';
      dom.nextSpotBadge.textContent = '待機中';
    }

    updateTimingStatus(currentSpot, nextSpot, currentMin);
  }

  function updateTimingStatus(currentSpot, nextSpot, currentMin) {
    if (!currentSpot && !nextSpot) {
      dom.timingStatusCard.className = 'timing-card status-relax';
      dom.timingLabel.textContent = 'ステータス';
      dom.timingMessage.textContent = '予定を追加してください';
      return;
    }

    if (!nextSpot) {
      dom.timingStatusCard.className = 'timing-card status-relax';
      dom.timingLabel.textContent = '予定完了';
      dom.timingMessage.textContent = '本日のすべての予定が終了しました';
      return;
    }

    const nextStartMin = getMinutesFromTimeString(nextSpot.startTime);
    const diffToNext = nextStartMin - currentMin;

    if (diffToNext > 25) {
      dom.timingStatusCard.className = 'timing-card status-relax';
      dom.timingLabel.textContent = '滞在中';
      dom.timingMessage.textContent = `次の移動まで、あと約${diffToNext}分あります`;
    } else if (diffToNext >= 5) {
      dom.timingStatusCard.className = 'timing-card status-warning';
      dom.timingLabel.textContent = 'そろそろ移動の準備';
      dom.timingMessage.textContent = `次の予定へ、そろそろ移動する時間です`;
    } else {
      dom.timingStatusCard.className = 'timing-card status-move';
      dom.timingLabel.textContent = '移動中 / 開始時間';
      dom.timingMessage.textContent = `次の予定の時間です`;
    }
  }

  function renderPastSchedule() {
    dom.selectPastDay.innerHTML = '';
    state.days.forEach((day, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = formatFullDate(day.date);
      if (idx === state.pastViewDayIndex) {
        opt.selected = true;
      }
      dom.selectPastDay.appendChild(opt);
    });

    dom.btnPastPrev.disabled = (state.pastViewDayIndex <= 0);
    dom.btnPastPrev.style.opacity = (state.pastViewDayIndex <= 0) ? '0.3' : '1';
    dom.btnPastNext.disabled = (state.pastViewDayIndex >= state.days.length - 1);
    dom.btnPastNext.style.opacity = (state.pastViewDayIndex >= state.days.length - 1) ? '0.3' : '1';

    const selectedDay = state.days[state.pastViewDayIndex] || state.days[0];
    const items = selectedDay.items || [];
    dom.pastDayScheduleList.innerHTML = '';

    if (items.length === 0) {
      dom.pastDayScheduleList.innerHTML = `
        <div style="text-align: center; padding: 25px; color: #8C939E; font-size: 13px;">
          この日の予定はありません。
        </div>
      `;
    } else {
      const overlappingIds = getOverlappingItemIds(items);

      items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'schedule-card';

        if (item.type === 'transit') {
          card.classList.add('is-transit');
        }

        const isOverlapping = overlappingIds.has(item.id);

        if (state.pastViewDayIndex === state.todayIndex && index === selectedDay.currentSpotIndex) {
          card.classList.add('is-current');
        }

        if (isOverlapping) {
          card.classList.add('is-overlapping');
        }

        card.innerHTML = createScheduleCardHtml(item, isOverlapping);

              setupCardDragAndDrop(card, index, state.pastViewDayIndex, dom.pastDayScheduleList);

      card.addEventListener('click', () => {
        if (card._didDrag) {
          card._didDrag = false;
          return;
        }
        openSpotActionPopup(item, index, state.pastViewDayIndex);
      });

        dom.pastDayScheduleList.appendChild(card);
      });
    }
  }

  dom.selectPastDay.addEventListener('change', (e) => {
    state.pastViewDayIndex = parseInt(e.target.value, 10);
    renderPastSchedule();
  });

  dom.btnPastPrev.addEventListener('click', () => {
    if (state.pastViewDayIndex > 0) {
      state.pastViewDayIndex--;
      renderPastSchedule();
    }
  });

  dom.btnPastNext.addEventListener('click', () => {
    if (state.pastViewDayIndex < state.days.length - 1) {
      state.pastViewDayIndex++;
      renderPastSchedule();
    }
  });

  // ポップアップ操作
  function openSpotActionPopup(item, index, dayIndex) {
    state.selectedActionItem = { item, index, dayIndex };
    
    if (item.type === 'transit') {
      dom.spotActionName.textContent = `${item.departureStation || ''} → ${item.arrivalStation || ''}`;
    } else {
      dom.spotActionName.textContent = item.title;
    }

    const timeRange = item.endTime ? `${item.startTime} 〜 ${item.endTime}` : item.startTime;
    dom.spotActionTime.textContent = timeRange;
    dom.modalSpotAction.classList.remove('hidden');
  }

  function closeSpotActionPopup() {
    dom.modalSpotAction.classList.add('hidden');
    state.selectedActionItem = null;
  }

  dom.btnSetAsCurrent.addEventListener('click', () => {
    if (state.selectedActionItem) {
      const { index, dayIndex } = state.selectedActionItem;
      state.todayIndex = dayIndex;
      state.days[dayIndex].currentSpotIndex = index;
      saveState();
      closeSpotActionPopup();
      render();
    }
  });

  dom.btnOpenEditContent.addEventListener('click', () => {
    if (state.selectedActionItem) {
      const item = state.selectedActionItem.item;
      closeSpotActionPopup();
      openEditModal(item);
    }
  });

  dom.btnDeleteFromAction.addEventListener('click', () => {
    if (state.selectedActionItem) {
      const { item, dayIndex } = state.selectedActionItem;
      state.days[dayIndex].items = state.days[dayIndex].items.filter(s => s.id !== item.id);
      if (state.days[dayIndex].currentSpotIndex >= state.days[dayIndex].items.length) {
        state.days[dayIndex].currentSpotIndex = Math.max(0, state.days[dayIndex].items.length - 1);
      }
      saveState();
      closeSpotActionPopup();
      render();
    }
  });

  dom.btnCloseSpotAction.addEventListener('click', closeSpotActionPopup);
  dom.modalSpotAction.querySelector('.modal-backdrop').addEventListener('click', closeSpotActionPopup);

  // モーダル操作: 場所 vs 交通機関の切り替え
  function updateFormTypeFields() {
    const isTransit = dom.radioTypeTransit.checked;
    if (isTransit) {
      dom.fieldSpotContainer.style.display = 'none';
      dom.fieldSpotContainer.classList.add('hidden');
      dom.fieldTransitContainer.style.display = 'flex';
      dom.fieldTransitContainer.classList.remove('hidden');
      dom.formTitle.removeAttribute('required');
      dom.formDepartureStation.setAttribute('required', 'true');
      dom.formArrivalStation.setAttribute('required', 'true');
      dom.labelStartTime.textContent = '出発時刻 *';
      dom.labelEndTime.textContent = '到着時刻';
    } else {
      dom.fieldSpotContainer.style.display = 'flex';
      dom.fieldSpotContainer.classList.remove('hidden');
      dom.fieldTransitContainer.style.display = 'none';
      dom.fieldTransitContainer.classList.add('hidden');
      dom.formTitle.setAttribute('required', 'true');
      dom.formDepartureStation.removeAttribute('required');
      dom.formArrivalStation.removeAttribute('required');
      dom.labelStartTime.textContent = '開始時刻 *';
      dom.labelEndTime.textContent = '終了時刻';
    }
  }

  // 開始時間が終了時間より後になった場合、終了時間を一旦1時間後に自動設定
  dom.formStartTime.addEventListener('change', () => {
    const startStr = dom.formStartTime.value;
    if (!startStr) return;
    const startMin = getMinutesFromTimeString(startStr);
    const endStr = dom.formEndTime.value;
    const endMin = endStr ? getMinutesFromTimeString(endStr) : 0;

    if (!endStr || startMin >= endMin) {
      const autoEndMin = Math.min(startMin + 60, 1439);
      dom.formEndTime.value = formatMinutesToTimeString(autoEndMin);
    }
  });

  dom.radioTypeSpot.addEventListener('change', updateFormTypeFields);
  dom.radioTypeTransit.addEventListener('change', updateFormTypeFields);

  document.querySelectorAll('.transit-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      dom.formTransitLine.value = chip.dataset.val;
    });
  });

  function openAddModal() {
    const currentDay = getCurrentScheduleDay();
    const badgeInfo = getRelativeDayBadgeInfo(currentDay.date);
    const dateLabel = formatDateOnly(currentDay.date);
    dom.modalTitle.textContent = `予定・交通の追加 (${dateLabel} ${badgeInfo.text})`;
    
    dom.formItemId.value = '';
    dom.formTitle.value = '';
    dom.formNearestStation.value = '';
    dom.formDepartureStation.value = '';
    dom.formArrivalStation.value = '';
    dom.formTransitPlatform.value = '';
    dom.formTransitLine.value = '';
    dom.radioTypeSpot.checked = true;
    updateFormTypeFields();
    
    // 初期値をご要望通り「現在の時間」に設定
    const now = new Date();
    const curH = String(now.getHours()).padStart(2, '0');
    const curM = String(now.getMinutes()).padStart(2, '0');
    const currentStart = curH + ":" + curM;
    const endMinutes = now.getHours() * 60 + now.getMinutes() + 60; // 1時間後
    
    dom.formStartTime.value = currentStart;
    dom.formEndTime.value = formatMinutesToTimeString(endMinutes);
    dom.formMemo.value = '';
    dom.btnDeleteItem.classList.add('hidden');
    dom.modalEditItem.classList.remove('hidden');
  }

  function openEditModal(item) {
    dom.modalTitle.textContent = '予定を編集';
    dom.formItemId.value = item.id;
    
    if (item.type === 'transit') {
      dom.radioTypeTransit.checked = true;
      dom.formDepartureStation.value = item.departureStation || '';
      dom.formArrivalStation.value = item.arrivalStation || '';
      dom.formTransitPlatform.value = item.platform || '';
      dom.formTransitLine.value = item.transitLine || '';
      dom.formTitle.value = '';
      dom.formNearestStation.value = '';
    } else {
      dom.radioTypeSpot.checked = true;
      dom.formTitle.value = item.title || '';
      dom.formNearestStation.value = item.nearestStation || '';
      dom.formDepartureStation.value = '';
      dom.formArrivalStation.value = '';
      dom.formTransitPlatform.value = '';
      dom.formTransitLine.value = '';
    }
    updateFormTypeFields();

    dom.formStartTime.value = item.startTime;
    dom.formEndTime.value = item.endTime || '';
    dom.formMemo.value = item.memo || '';
    dom.btnDeleteItem.classList.remove('hidden');
    dom.modalEditItem.classList.remove('hidden');
  }

  function closeModal() {
    dom.modalEditItem.classList.add('hidden');
  }

  dom.scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = dom.formItemId.value;
    const isTransit = dom.radioTypeTransit.checked;
    const startTime = dom.formStartTime.value;
    const endTime = dom.formEndTime.value;
    const memo = dom.formMemo.value.trim();

    let type = 'spot';
    let title = '';
    let nearestStation = '';
    let departureStation = '';
    let arrivalStation = '';
    let platform = '';
    let transitLine = '';

    if (isTransit) {
      type = 'transit';
      departureStation = dom.formDepartureStation.value.trim();
      arrivalStation = dom.formArrivalStation.value.trim();
      platform = dom.formTransitPlatform.value.trim();
      transitLine = dom.formTransitLine.value.trim();

      if (!departureStation || !arrivalStation) return;
      title = `${departureStation} → ${arrivalStation}`;
    } else {
      type = 'spot';
      title = dom.formTitle.value.trim();
      nearestStation = dom.formNearestStation.value.trim();
      if (!title) return;
    }

    if (!startTime) return;

    // バリデーション: 開始時間 >= 終了時間 の場合は保存させない
    if (endTime) {
      const startMin = getMinutesFromTimeString(startTime);
      const endMin = getMinutesFromTimeString(endTime);
      if (startMin >= endMin) {
        alert('終了時刻は開始時刻より後の時間を設定してください。');
        return;
      }
    }

    const currentDay = getCurrentScheduleDay();
    if (!currentDay.items) currentDay.items = [];

    // 現在選択中の予定IDを記憶（ソートで位置が変わっても赤枠ハイライトを正しく追従させるため）
    const currentSpot = currentDay.items[currentDay.currentSpotIndex];
    const currentSpotId = currentSpot ? currentSpot.id : null;

    if (id) {
      const index = currentDay.items.findIndex(s => s.id === id);
      if (index !== -1) {
        currentDay.items[index] = {
          ...currentDay.items[index],
          type,
          title,
          nearestStation,
          departureStation,
          arrivalStation,
          platform,
          transitLine,
          startTime,
          endTime,
          memo
        };
      }
    } else {
      const newItem = {
        id: (type === 'transit' ? 'transit-' : 'spot-') + Date.now(),
        type,
        title,
        nearestStation,
        departureStation,
        arrivalStation,
        platform,
        transitLine,
        startTime,
        endTime,
        memo
      };
      currentDay.items.push(newItem);
    }

    // 前の予定が後ろの予定より後の時間に変更された場合も自動で場所を入れ替え（時系列ソート）
    currentDay.items.sort((a, b) => {
      return getMinutesFromTimeString(a.startTime) - getMinutesFromTimeString(b.startTime);
    });

    // 赤枠ハイライトの追従
    if (currentSpotId) {
      const newCurrIdx = currentDay.items.findIndex(s => s.id === currentSpotId);
      if (newCurrIdx !== -1) {
        currentDay.currentSpotIndex = newCurrIdx;
      }
    }

    saveState();
    closeModal();
    render();
  });

  dom.btnDeleteItem.addEventListener('click', () => {
    const id = dom.formItemId.value;
    if (!id) return;
    const currentDay = getCurrentScheduleDay();
    currentDay.items = currentDay.items.filter(s => s.id !== id);
    if (currentDay.currentSpotIndex >= currentDay.items.length) {
      currentDay.currentSpotIndex = Math.max(0, currentDay.items.length - 1);
    }
    saveState();
    closeModal();
    render();
  });

  dom.btnCloseModal.addEventListener('click', closeModal);
  dom.btnCancelModal.addEventListener('click', closeModal);
  dom.modalEditItem.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  // ===================================================
  // 日程ナビゲーション & 日程追加・変更イベントリスナー
  // ===================================================

  // しおり画面の日程切り替え（前へ）
  if (dom.btnSchedulePrev) {
    dom.btnSchedulePrev.addEventListener('click', () => {
      if (state.scheduleViewDayIndex > 0) {
        state.scheduleViewDayIndex--;
        renderSchedule();
      }
    });
  }

  // しおり画面の日程切り替え（次へ）
  if (dom.btnScheduleNext) {
    dom.btnScheduleNext.addEventListener('click', () => {
      if (state.scheduleViewDayIndex < state.days.length - 1) {
        state.scheduleViewDayIndex++;
        renderSchedule();
      }
    });
  }

  // しおり画面の日程切り替え（プルダウン）
  if (dom.selectScheduleDay) {
    dom.selectScheduleDay.addEventListener('change', (e) => {
      state.scheduleViewDayIndex = parseInt(e.target.value, 10);
      renderSchedule();
    });
  }

  // 新しい日程の追加モーダルを開く関数（明日や翌日を初期値に）
  function openAddDayModal() {
    let baseDate = new Date();
    if (state.days && state.days.length > 0) {
      // 登録されている中で最も遅い日付を探す
      const lastDay = state.days[state.days.length - 1];
      const parsed = new Date(lastDay.date.replace(/-/g, '/'));
      if (!isNaN(parsed.getTime())) {
        baseDate = parsed;
      }
    }
    // その翌日（+1日）を初期値にセット
    baseDate.setDate(baseDate.getDate() + 1);
    const y = baseDate.getFullYear();
    const m = String(baseDate.getMonth() + 1).padStart(2, '0');
    const d = String(baseDate.getDate()).padStart(2, '0');
    dom.newDayDate.value = `${y}-${m}-${d}`;
    dom.modalAddDay.classList.remove('hidden');
  }

  if (dom.btnOpenAddDaySchedule) {
    dom.btnOpenAddDaySchedule.addEventListener('click', openAddDayModal);
  }
  if (dom.btnOpenAddDay) {
    dom.btnOpenAddDay.addEventListener('click', openAddDayModal);
  }

  // 日程追加の保存
  dom.dayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = dom.newDayDate.value;
    if (!date) return;

    // すでに同日が存在するかチェック
    const existingIndex = state.days.findIndex(d => d.date === date);
    if (existingIndex !== -1) {
      state.scheduleViewDayIndex = existingIndex;
      dom.modalAddDay.classList.add('hidden');
      render();
      showToast(`${formatDateOnly(date)} は既に存在します`);
      return;
    }

    const newDay = {
      id: 'day-' + Date.now(),
      date,
      currentSpotIndex: 0,
      items: []
    };

    state.days.push(newDay);
    state.days.sort((a, b) => {
      const timeA = new Date(a.date.replace(/-/g, '/')).getTime();
      const timeB = new Date(b.date.replace(/-/g, '/')).getTime();
      return timeA - timeB;
    });

    // 追加した日のインデックスに移動
    state.scheduleViewDayIndex = state.days.findIndex(d => d.id === newDay.id);
    state.pastViewDayIndex = state.scheduleViewDayIndex;

    // 本日のインデックスも再特定
    const todayStr = getInitialTodayDate();
    const tIdx = state.days.findIndex(d => d.date === todayStr);
    state.todayIndex = tIdx !== -1 ? tIdx : 0;

    saveState();
    dom.modalAddDay.classList.add('hidden');
    render();
    showToast(`${formatDateOnly(date)} の日程を追加しました`);
  });

  dom.btnCloseDayModal.addEventListener('click', () => dom.modalAddDay.classList.add('hidden'));
  dom.btnCancelDayModal.addEventListener('click', () => dom.modalAddDay.classList.add('hidden'));
  dom.modalAddDay.querySelector('.modal-backdrop').addEventListener('click', () => dom.modalAddDay.classList.add('hidden'));

  // 日程変更・削除モーダルの操作
  function openEditDayModal() {
    const currentDay = getCurrentScheduleDay();
    dom.editDayDate.value = currentDay.date;
    
    // 日程が1つだけの場合は削除を非表示（最低1日は残す）
    if (state.days.length <= 1) {
      dom.btnDeleteDay.style.display = 'none';
    } else {
      dom.btnDeleteDay.style.display = 'inline-block';
    }

    dom.modalEditDay.classList.remove('hidden');
  }

  if (dom.btnOpenEditDay) {
    dom.btnOpenEditDay.addEventListener('click', openEditDayModal);
  }

  // 日程変更の保存
  if (dom.editDayForm) {
    dom.editDayForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newDate = dom.editDayDate.value;
      if (!newDate) return;

      const currentDay = getCurrentScheduleDay();
      currentDay.date = newDate;

      state.days.sort((a, b) => {
        const timeA = new Date(a.date.replace(/-/g, '/')).getTime();
        const timeB = new Date(b.date.replace(/-/g, '/')).getTime();
        return timeA - timeB;
      });

      state.scheduleViewDayIndex = state.days.findIndex(d => d.id === currentDay.id);
      
      const todayStr = getInitialTodayDate();
      const tIdx = state.days.findIndex(d => d.date === todayStr);
      state.todayIndex = tIdx !== -1 ? tIdx : 0;

      saveState();
      dom.modalEditDay.classList.add('hidden');
      render();
      showToast('日程を変更しました');
    });
  }

  // 日程の削除
  if (dom.btnDeleteDay) {
    dom.btnDeleteDay.addEventListener('click', () => {
      if (state.days.length <= 1) {
        alert('これ以上日程を削除することはできません。');
        return;
      }
      const currentDay = getCurrentScheduleDay();
      const dateLabel = formatDateOnly(currentDay.date);
      if (!confirm(`${dateLabel}の日程（登録されている予定も含みます）を削除しますか？`)) {
        return;
      }

      state.days = state.days.filter(d => d.id !== currentDay.id);
      if (state.scheduleViewDayIndex >= state.days.length) {
        state.scheduleViewDayIndex = Math.max(0, state.days.length - 1);
      }

      const todayStr = getInitialTodayDate();
      const tIdx = state.days.findIndex(d => d.date === todayStr);
      state.todayIndex = tIdx !== -1 ? tIdx : 0;

      saveState();
      dom.modalEditDay.classList.add('hidden');
      render();
      showToast('日程を削除しました');
    });
  }

  if (dom.btnCloseEditDayModal) {
    dom.btnCloseEditDayModal.addEventListener('click', () => dom.modalEditDay.classList.add('hidden'));
  }
  if (dom.btnCancelEditDayModal) {
    dom.btnCancelEditDayModal.addEventListener('click', () => dom.modalEditDay.classList.add('hidden'));
  }
  if (dom.modalEditDay) {
    dom.modalEditDay.querySelector('.modal-backdrop').addEventListener('click', () => dom.modalEditDay.classList.add('hidden'));
  }

  // ナビゲーション切り替え
  dom.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  dom.btnOpenAddSchedule.addEventListener('click', openAddModal);

  dom.btnNextAction.addEventListener('click', () => {
    const today = getTodayDay();
    if (today.currentSpotIndex < today.items.length - 1) {
      today.currentSpotIndex++;
      saveState();
      render();
    }
  });

  setInterval(() => {
    renderClock();
  }, 30000);

  
  // ===================================================
  // 予定の長押しドラッグ＆ドロップ並び替え ＆ 時間連動処理
  // ===================================================

  // 予定の所要時間（分単位）を計算
  function getItemDurationMinutes(item) {
    const start = parseTimeToMinutes(item.startTime);
    if (item.endTime) {
      const end = parseTimeToMinutes(item.endTime);
      if (end > start) {
        return end - start;
      }
    }
    return 60; // 終了時刻が未設定または同時の場合はデフォルト60分
  }

  // 分単位の数値を "HH:MM" 形式文字列に変換（23:59を超えないよう安全処理）
  function safeMinutesToTime(min) {
    if (isNaN(min) || min < 0) min = 0;
    if (min >= 1440) min = 1439; // 23:59 でクリップ
    return formatMinutesToTimeString(min);
  }

  // トースト通知を表示
  function showToast(message) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  // 予定を並び替え、ユーザー指示通りの時間シフト・連動を行う
  function reorderScheduleWithTimeShift(dayIndex, fromIndex, toIndex) {
    const day = state.days[dayIndex];
    if (!day || !day.items) return;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= day.items.length) return;
    if (toIndex < 0 || toIndex >= day.items.length) return;

    // 現在選択中のスポットIDを記録（赤枠ハイライトを正しく追従させるため）
    const currentSpot = day.items[day.currentSpotIndex];
    const currentSpotId = currentSpot ? currentSpot.id : null;

    const items = [...day.items];
    const movedItem = items[fromIndex];
    const duration = getItemDurationMinutes(movedItem);

    // 【ユーザー要望のアルゴリズム】
    // 「時間は入れ替えた時間を引き継いで。時間がずれた予定は、ずらした予定分の時間プラスしたらいいはず」

    if (toIndex < fromIndex) {
      // ===== 上方向への移動 =====
      // 移動先（toIndex）の予定が元々持っていた開始時間を引き継ぐ
      const targetOriginalStart = parseTimeToMinutes(items[toIndex].startTime);

      // 配列上で取り出して新しい位置に挿入
      items.splice(fromIndex, 1);
      items.splice(toIndex, 0, movedItem);

      // 移動した予定の開始・終了時刻を設定
      movedItem.startTime = safeMinutesToTime(targetOriginalStart);
      movedItem.endTime = safeMinutesToTime(targetOriginalStart + duration);

      // 後ろに押し出された予定たち（toIndex + 1 から末尾まで）に duration をプラス
      for (let i = toIndex + 1; i < items.length; i++) {
        const it = items[i];
        const itStart = parseTimeToMinutes(it.startTime);
        const itDur = getItemDurationMinutes(it);
        const newStart = itStart + duration;
        it.startTime = safeMinutesToTime(newStart);
        it.endTime = safeMinutesToTime(newStart + itDur);
      }
    } else {
      // ===== 下方向への移動 =====
      // 配列上で取り出して新しい位置に挿入
      items.splice(fromIndex, 1);
      items.splice(toIndex, 0, movedItem);

      // 直前の予定（toIndex - 1）の終了時間を引き継ぐ
      const prevItem = items[toIndex - 1];
      const prevEnd = prevItem.endTime 
        ? parseTimeToMinutes(prevItem.endTime) 
        : parseTimeToMinutes(prevItem.startTime) + 60;

      movedItem.startTime = safeMinutesToTime(prevEnd);
      movedItem.endTime = safeMinutesToTime(prevEnd + duration);

      // 直後（toIndex + 1 以降）に予定があり、movedItem と時間が重なる場合、
      // ユーザーの指示通り「ずらした予定分の時間（duration）プラス」して後ろへシフト
      if (toIndex + 1 < items.length) {
        const nextItem = items[toIndex + 1];
        const nextStart = parseTimeToMinutes(nextItem.startTime);
        const movedEndMin = parseTimeToMinutes(movedItem.endTime);

        if (nextStart < movedEndMin) {
          const shiftAmount = (movedEndMin - nextStart) > duration ? (movedEndMin - nextStart) : duration;
          for (let i = toIndex + 1; i < items.length; i++) {
            const it = items[i];
            const itStart = parseTimeToMinutes(it.startTime);
            const itDur = getItemDurationMinutes(it);
            const newStart = itStart + shiftAmount;
            it.startTime = safeMinutesToTime(newStart);
            it.endTime = safeMinutesToTime(newStart + itDur);
          }
        }
      }
    }

    day.items = items;

    // 赤枠ハイライト（現在の予定）を元の予定に追従
    if (currentSpotId) {
      const newCurrIdx = day.items.findIndex(it => it.id === currentSpotId);
      if (newCurrIdx !== -1) {
        day.currentSpotIndex = newCurrIdx;
      }
    }

    saveState();
    render();
    showToast('予定を並び替え、時間を更新しました');
  }

  // しおりカードの長押しドラッグ＆ドロップ登録
  function setupCardDragAndDrop(card, index, dayIndex, container) {
    let startX = 0;
    let startY = 0;
    let longPressTimer = null;
    let isDragging = false;
    let ghostEl = null;
    let dropIndicator = null;
    let currentDropIndex = index;

    card._didDrag = false;

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return; // 左クリックのみ
      
      const point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      isDragging = false;
      card._didDrag = false;

      // 360ms の長押しでドラッグ開始
      longPressTimer = setTimeout(() => {
        startDragging(point);
      }, 360);

      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('touchend', onPointerUp);
      window.addEventListener('mouseup', onPointerUp);
      window.addEventListener('touchcancel', onPointerUp);
    }

    function startDragging(point) {
      isDragging = true;
      card._didDrag = true;
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch (err) {}
      }

      const rect = card.getBoundingClientRect();
      const offsetX = point.clientX - rect.left;
      const offsetY = point.clientY - rect.top;

      // ゴースト要素を作成
      ghostEl = card.cloneNode(true);
      ghostEl.classList.add('drag-ghost');
      if (card.classList.contains('is-current')) {
        ghostEl.classList.add('is-current');
      }
      ghostEl.style.width = rect.width + 'px';
      ghostEl.style.height = rect.height + 'px';
      ghostEl.style.left = (point.clientX - offsetX) + 'px';
      ghostEl.style.top = (point.clientY - offsetY) + 'px';
      document.body.appendChild(ghostEl);

      // 元のカードを点線プレースホルダー表示に
      card.classList.add('is-dragging-original');

      // 挿入位置を示す青いラインインジケーターを作成
      dropIndicator = document.createElement('div');
      dropIndicator.className = 'drop-indicator';

      currentDropIndex = index;
      card.parentNode.insertBefore(dropIndicator, card);
    }

    function onPointerMove(e) {
      const point = e.touches ? e.touches[0] : e;
      const diffX = Math.abs(point.clientX - startX);
      const diffY = Math.abs(point.clientY - startY);

      if (!isDragging) {
        // 長押し前に指が動いた場合は通常の画面スクロールとみなして長押しをキャンセル
        if (diffX > 10 || diffY > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        return;
      }

      // ドラッグ中は画面スクロールを防止
      if (e.cancelable) {
        e.preventDefault();
      }

      // ゴースト要素の位置更新（指の中央に追従）
      if (ghostEl) {
        const rect = card.getBoundingClientRect();
        ghostEl.style.left = (point.clientX - rect.width / 2) + 'px';
        ghostEl.style.top = (point.clientY - 35) + 'px';
      }

      // 自分以外のカード要素一覧
      const allCards = Array.from(container.querySelectorAll('.schedule-card:not(.is-dragging-original)'));
      let newDropIndex = allCards.length;

      for (let i = 0; i < allCards.length; i++) {
        const targetCard = allCards[i];
        const tRect = targetCard.getBoundingClientRect();
        const tMidY = tRect.top + tRect.height / 2;

        if (point.clientY < tMidY) {
          newDropIndex = i;
          break;
        }
      }

      currentDropIndex = newDropIndex;

      // 青いドロップラインの位置を更新
      if (dropIndicator) {
        if (newDropIndex < allCards.length) {
          container.insertBefore(dropIndicator, allCards[newDropIndex]);
        } else {
          container.appendChild(dropIndicator);
        }
      }
    }

    function onPointerUp() {
      clearTimeout(longPressTimer);
      longPressTimer = null;

      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchcancel', onPointerUp);

      if (!isDragging) return;

      isDragging = false;

      // ゴーストとドロップラインを削除
      if (ghostEl && ghostEl.parentNode) {
        ghostEl.parentNode.removeChild(ghostEl);
      }
      if (dropIndicator && dropIndicator.parentNode) {
        dropIndicator.parentNode.removeChild(dropIndicator);
      }
      card.classList.remove('is-dragging-original');

      // 並び替えの実行
      const finalIndex = currentDropIndex;
      if (finalIndex !== index) {
        reorderScheduleWithTimeShift(dayIndex, index, finalIndex);
      }
    }

    card.addEventListener('touchstart', onPointerDown, { passive: true });
    card.addEventListener('mousedown', onPointerDown);
  }

  loadState();
  render();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
