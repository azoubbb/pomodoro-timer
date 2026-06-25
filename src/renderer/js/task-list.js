// task-list.js — manages the task UI and keeps it in sync with main-process
// state. The "active" task is the one whose pomodoroSpent counter ticks up
// when a work phase completes.

export function createTaskList({ api, root }) {
  const form    = root.querySelector('#task-form');
  const input   = root.querySelector('#task-input');
  const listEl  = root.querySelector('#task-list');
  const emptyEl = root.querySelector('#task-empty');
  const picker  = root.querySelector('#task-picker');

  /** @type {Array<{id:string,title:string,completed:boolean,pomodorosSpent:number}>} */
  let tasks = [];
  let activeId = '';

  function updateEmptyState() {
    emptyEl.classList.toggle('hidden', tasks.length > 0);
  }

  function renderList() {
    listEl.innerHTML = '';
    for (const t of tasks) {
      const li = document.createElement('li');
      if (t.id === activeId) li.classList.add('active');
      li.dataset.id = t.id;

      const dot = document.createElement('span');
      dot.className = 'task-active-dot';
      dot.title = '正在进行的任务';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!t.completed;
      checkbox.addEventListener('change', async () => {
        const wasActive = t.id === activeId;
        const becomingComplete = checkbox.checked;
        await api.tasksUpdate(t.id, { completed: becomingComplete });

        // If the user just completed the currently active task, auto-advance
        // the active pointer to the next incomplete task. If none remain,
        // clear it.
        if (becomingComplete && wasActive) {
          const fresh = await api.tasksList();
          const next = fresh.find((x) => !x.completed && x.id !== t.id);
          activeId = next ? next.id : '';
          await api.timerSetActiveTask(activeId || null);
        }
        await refresh();
      });

      const title = document.createElement('span');
      title.className = 'task-title' + (t.completed ? ' completed' : '');
      title.textContent = t.title;
      title.title = t.title;
      title.addEventListener('click', () => {
        activeId = t.id === activeId ? '' : t.id;
        api.timerSetActiveTask(activeId || null).then(refresh);
      });

      const pomos = document.createElement('span');
      pomos.className = 'pomodoros';
      pomos.textContent = `${t.pomodorosSpent || 0} 🍅`;
      pomos.title = '该任务已完成的番茄数';

      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.setAttribute('aria-label', '删除任务');
      del.textContent = '✕';
      del.addEventListener('click', async () => {
        if (t.id === activeId) {
          activeId = '';
          await api.timerSetActiveTask(null);
        }
        await api.tasksDelete(t.id);
        await refresh();
      });

      li.append(dot, checkbox, title, pomos, del);
      listEl.appendChild(li);
    }
    updateEmptyState();
  }

  function renderPicker() {
    // Preserve the current selection while rebuilding.
    const current = picker.value;
    picker.innerHTML = '';

    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— 无任务 —';
    picker.appendChild(none);

    // Track which task ids are actually present in the rebuilt dropdown
    // (completed tasks are excluded). We must look at THIS set, not the full
    // `tasks` array — otherwise a just-completed id would be considered
    // "still available" even though its <option> no longer exists, causing
    // picker.value to silently fall back to the first option.
    const availableIds = new Set();
    for (const t of tasks) {
      if (t.completed) continue;
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title;
      picker.appendChild(opt);
      availableIds.add(t.id);
    }
    picker.value = availableIds.has(current) ? current : (activeId || '');
  }

  async function refresh() {
    tasks = await api.tasksList();
    renderList();
    renderPicker();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    await api.tasksAdd(title);
    input.value = '';
    await refresh();
  });

  picker.addEventListener('change', async () => {
    activeId = picker.value;
    await api.timerSetActiveTask(activeId || null);
    renderList();
  });

  return {
    refresh,
    setActiveFromTimer: (id) => {
      const next = id || '';
      if (next === activeId) return; // no change — skip DOM rebuild
      activeId = next;
      renderList();
      renderPicker();
    },
  };
}
