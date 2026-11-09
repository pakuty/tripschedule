/**
 * 日程管理アプリ - アプリケーションロジック (時刻テスト削除・本番クリーン版)
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

// --- 初期データ（データは完全に空、本日の日付枠のみ） ---
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
  pastViewDayIndex: 0,
  activeView: 'schedule',
  selectedActionItem: null
};

// --- ストレージ読み書き ---
const STORAGE_KEY_DAYS = 'schedule_app_days_v5';
const STORAGE_KEY_TODAY_IDX = 'schedule_app_today_idx_v5';

function loadState() {
  try {
    const savedDays = safeStorage.getItem(STORAGE_KEY_DAYS);
    const savedTodayIdx = safeStorage.getItem(STORAGE_KEY_TODAY_IDX);

    state.days = savedDays ? JSON.parse(savedDays) : JSON.parse(JSON.stringify(CLEAN_DEFAULT_DAYS));
    state.todayIndex = savedTodayIdx !== null ? parseInt(savedTodayIdx, 10) : 0;
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

// 本日の日程オブジェクトを取得
function getTodayDay() {
  if (!state.days || state.days.length === 0) {
    state.days = JSON.parse(JSON.stringify(CLEAN_DEFAULT_DAYS));
  }
  if (state.todayIndex >= state.days.length) {
    state.todayIndex = 0;
  }
  return state.days[state.todayIndex];
}

// --- 時刻・日付ユーティリティ ---
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

// 純粋に実時間（端末の時間）を取得
function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
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
    
    // しおり画面
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
    nowSpotTime: document.getElementById('now-spot-time'),
    nowSpotMemo: document.getElementById('now-spot-memo'),
    nextSpotBadge: document.getElementById('next-spot-badge'),
    nextSpotTitle: document.getElementById('next-spot-title'),
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
    formTransitLine: document.getElementById('form-transit-line'),
    formDepartureStation: document.getElementById('form-departure-station'),
    formArrivalStation: document.getElementById('form-arrival-station'),
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
    btnCancelDayModal: document.getElementById('btn-cancel-day-modal')
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

  function renderSchedule() {
    const today = getTodayDay();
    const items = today.items || [];

    dom.mainDayLabel.textContent = formatDateOnly(today.date);
    dom.mainDaySpotsCount.textContent = `${items.length}件の予定`;

    dom.scheduleList.innerHTML = '';

    if (items.length === 0) {
      dom.scheduleList.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #8C939E; font-size: 13px;">
          予定はまだ登録されていません。<br>右上の「+ 予定を追加」から予定を登録してください。
        </div>
      `;
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'schedule-card';

      if (item.type === 'transit') {
        card.classList.add('is-transit');
      }

      const isCurrent = (index === today.currentSpotIndex);
      const isPast = (index < today.currentSpotIndex);

      if (isCurrent) {
        card.classList.add('is-current');
      } else if (isPast) {
        card.classList.add('is-past');
      }

      const timeRange = item.endTime ? `${item.startTime} 〜 ${item.endTime}` : item.startTime;
      const typeBadge = item.type === 'transit'
        ? '<span class="type-badge badge-transit">移動</span>'
        : '<span class="type-badge badge-spot">場所</span>';

      let titleHtml = `<div class="schedule-title">${escapeHtml(item.title)}</div>`;
      if (item.type === 'transit' && item.departureStation && item.arrivalStation) {
        titleHtml = `
          <div class="schedule-stations-row">${escapeHtml(item.departureStation)} &rarr; ${escapeHtml(item.arrivalStation)}</div>
          ${item.transitLine ? `<div class="schedule-title" style="font-size:14px; color:#555;">${escapeHtml(item.transitLine)}</div>` : ''}
        `;
      }

      card.innerHTML = `
        <div class="card-top-row">
          ${typeBadge}
          <span class="schedule-time">${timeRange}</span>
        </div>
        ${titleHtml}
        ${item.memo ? `<div class="schedule-memo">${escapeHtml(item.memo)}</div>` : ''}
      `;

      card.addEventListener('click', () => {
        openSpotActionPopup(item, index, state.todayIndex);
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

    if (currentSpot) {
      if (currentSpot.type === 'transit' && currentSpot.departureStation && currentSpot.arrivalStation) {
        dom.nowSpotTitle.textContent = `${currentSpot.departureStation} → ${currentSpot.arrivalStation}`;
      } else {
        dom.nowSpotTitle.textContent = currentSpot.title;
      }
      dom.nowSpotTime.textContent = currentSpot.endTime 
        ? `${currentSpot.startTime} 〜 ${currentSpot.endTime}` 
        : `${currentSpot.startTime} 開始`;
      dom.nowSpotMemo.textContent = currentSpot.memo || 'メモなし';

      if (currentSpot.type === 'transit') {
        dom.nowSpotBadge.className = 'type-badge badge-transit';
        dom.nowSpotBadge.textContent = '交通機関・移動中';
      } else {
        dom.nowSpotBadge.className = 'type-badge badge-spot';
        dom.nowSpotBadge.textContent = '滞在中スポット';
      }
    } else {
      dom.nowSpotTitle.textContent = '予定がありません';
      dom.nowSpotTime.textContent = '--:-- 〜 --:--';
      dom.nowSpotMemo.textContent = 'しおりから予定を追加してください';
      dom.nowSpotBadge.className = 'type-badge badge-spot';
      dom.nowSpotBadge.textContent = '待機中';
    }

    if (nextSpot) {
      if (nextSpot.type === 'transit' && nextSpot.departureStation && nextSpot.arrivalStation) {
        dom.nextSpotTitle.textContent = `${nextSpot.departureStation} → ${nextSpot.arrivalStation}`;
      } else {
        dom.nextSpotTitle.textContent = nextSpot.title;
      }
      dom.nextSpotTime.textContent = `${nextSpot.startTime} 開始予定`;
      dom.nextSpotMemo.textContent = nextSpot.memo || '';
      dom.btnNextAction.style.display = 'flex';
      dom.btnNextAction.querySelector('span').textContent = `「${dom.nextSpotTitle.textContent}」へ移動・次へ`;

      if (nextSpot.type === 'transit') {
        dom.nextSpotBadge.className = 'type-badge badge-transit';
        dom.nextSpotBadge.textContent = '次の移動';
      } else {
        dom.nextSpotBadge.className = 'type-badge badge-spot';
        dom.nextSpotBadge.textContent = '次の目的地';
      }
    } else {
      dom.nextSpotTitle.textContent = '次の予定はありません';
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
      items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'schedule-card';

        if (item.type === 'transit') {
          card.classList.add('is-transit');
        }

        if (state.pastViewDayIndex === state.todayIndex && index === selectedDay.currentSpotIndex) {
          card.classList.add('is-current');
        }

        const timeRange = item.endTime ? `${item.startTime} 〜 ${item.endTime}` : item.startTime;
        const typeBadge = item.type === 'transit'
          ? '<span class="type-badge badge-transit">移動</span>'
          : '<span class="type-badge badge-spot">場所</span>';

        let titleHtml = `<div class="schedule-title">${escapeHtml(item.title)}</div>`;
        if (item.type === 'transit' && item.departureStation && item.arrivalStation) {
          titleHtml = `
            <div class="schedule-stations-row">${escapeHtml(item.departureStation)} &rarr; ${escapeHtml(item.arrivalStation)}</div>
            ${item.transitLine ? `<div class="schedule-title" style="font-size:14px; color:#555;">${escapeHtml(item.transitLine)}</div>` : ''}
          `;
        }

        card.innerHTML = `
          <div class="card-top-row">
            ${typeBadge}
            <span class="schedule-time">${timeRange}</span>
          </div>
          ${titleHtml}
          ${item.memo ? `<div class="schedule-memo">${escapeHtml(item.memo)}</div>` : ''}
        `;

        card.addEventListener('click', () => {
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
    
    if (item.type === 'transit' && item.departureStation && item.arrivalStation) {
      dom.spotActionName.textContent = `${item.departureStation} → ${item.arrivalStation}`;
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

  // モーダル操作
  function updateFormTypeFields() {
    const isTransit = dom.radioTypeTransit.checked;
    if (isTransit) {
      dom.fieldSpotContainer.classList.add('hidden');
      dom.fieldTransitContainer.classList.remove('hidden');
      dom.formTitle.removeAttribute('required');
      dom.formDepartureStation.setAttribute('required', 'true');
      dom.formArrivalStation.setAttribute('required', 'true');
      dom.labelStartTime.textContent = '出発時刻 *';
      dom.labelEndTime.textContent = '到着時刻';
    } else {
      dom.fieldSpotContainer.classList.remove('hidden');
      dom.fieldTransitContainer.classList.add('hidden');
      dom.formTitle.setAttribute('required', 'true');
      dom.formDepartureStation.removeAttribute('required');
      dom.formArrivalStation.removeAttribute('required');
      dom.labelStartTime.textContent = '開始時刻 *';
      dom.labelEndTime.textContent = '終了時刻';
    }
  }

  dom.radioTypeSpot.addEventListener('change', updateFormTypeFields);
  dom.radioTypeTransit.addEventListener('change', updateFormTypeFields);

  document.querySelectorAll('.transit-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      dom.formTransitLine.value = chip.dataset.val;
    });
  });

  function openAddModal() {
    dom.modalTitle.textContent = '予定・交通の追加';
    dom.formItemId.value = '';
    dom.formTitle.value = '';
    dom.formTransitLine.value = '';
    dom.formDepartureStation.value = '';
    dom.formArrivalStation.value = '';
    dom.radioTypeSpot.checked = true;
    updateFormTypeFields();
    
    const today = getTodayDay();
    const items = today.items || [];
    let nextStart = '09:00';
    if (items.length > 0) {
      const last = items[items.length - 1];
      if (last.endTime) {
        const nextMin = getMinutesFromTimeString(last.endTime) + 15;
        nextStart = formatMinutesToTimeString(nextMin);
      }
    }
    dom.formStartTime.value = nextStart;
    dom.formEndTime.value = formatMinutesToTimeString(getMinutesFromTimeString(nextStart) + 60);
    dom.formMemo.value = '';
    dom.btnDeleteItem.classList.add('hidden');
    dom.modalEditItem.classList.remove('hidden');
  }

  function openEditModal(item) {
    dom.modalTitle.textContent = '予定を編集';
    dom.formItemId.value = item.id;
    
    if (item.type === 'transit') {
      dom.radioTypeTransit.checked = true;
      dom.formTransitLine.value = item.transitLine || '';
      dom.formDepartureStation.value = item.departureStation || '';
      dom.formArrivalStation.value = item.arrivalStation || '';
      dom.formTitle.value = item.title || '';
    } else {
      dom.radioTypeSpot.checked = true;
      dom.formTitle.value = item.title || '';
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
    let transitLine = '';
    let departureStation = '';
    let arrivalStation = '';

    if (isTransit) {
      type = 'transit';
      transitLine = dom.formTransitLine.value.trim();
      departureStation = dom.formDepartureStation.value.trim();
      arrivalStation = dom.formArrivalStation.value.trim();

      if (!departureStation || !arrivalStation) return;

      title = transitLine 
        ? `${transitLine} (${departureStation} → ${arrivalStation})`
        : `${departureStation} → ${arrivalStation}`;
    } else {
      type = 'spot';
      title = dom.formTitle.value.trim();
      if (!title) return;
    }

    if (!startTime) return;

    const today = getTodayDay();
    if (!today.items) today.items = [];

    if (id) {
      const index = today.items.findIndex(s => s.id === id);
      if (index !== -1) {
        today.items[index] = {
          ...today.items[index],
          type,
          title,
          transitLine,
          departureStation,
          arrivalStation,
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
        transitLine,
        departureStation,
        arrivalStation,
        startTime,
        endTime,
        memo
      };
      today.items.push(newItem);
      today.items.sort((a, b) => {
        return getMinutesFromTimeString(a.startTime) - getMinutesFromTimeString(b.startTime);
      });
    }

    saveState();
    closeModal();
    render();
  });

  dom.btnDeleteItem.addEventListener('click', () => {
    const id = dom.formItemId.value;
    if (!id) return;
    const today = getTodayDay();
    today.items = today.items.filter(s => s.id !== id);
    if (today.currentSpotIndex >= today.items.length) {
      today.currentSpotIndex = Math.max(0, today.items.length - 1);
    }
    saveState();
    closeModal();
    render();
  });

  dom.btnCloseModal.addEventListener('click', closeModal);
  dom.btnCancelModal.addEventListener('click', closeModal);
  dom.modalEditItem.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  // 日程追加
  dom.btnOpenAddDay.addEventListener('click', () => {
    const now = new Date();
    now.setDate(now.getDate() + state.days.length);
    const nextDate = now.toISOString().split('T')[0];
    dom.newDayDate.value = nextDate;
    dom.modalAddDay.classList.remove('hidden');
  });

  dom.dayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = dom.newDayDate.value;
    if (!date) return;

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
    
    state.pastViewDayIndex = state.days.findIndex(d => d.id === newDay.id);
    saveState();
    dom.modalAddDay.classList.add('hidden');
    render();
  });

  dom.btnCloseDayModal.addEventListener('click', () => dom.modalAddDay.classList.add('hidden'));
  dom.btnCancelDayModal.addEventListener('click', () => dom.modalAddDay.classList.add('hidden'));
  dom.modalAddDay.querySelector('.modal-backdrop').addEventListener('click', () => dom.modalAddDay.classList.add('hidden'));

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

  // 初回描画
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
