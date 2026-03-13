const DB_KEY = 'sga_frontend_db_v1';
const PAGE_SIZE = 6;

const ui = {
  tableHead: document.getElementById('tableHead'),
  tableBody: document.getElementById('tableBody'),
  panelTitle: document.getElementById('panelTitle'),
  pageInfo: document.getElementById('pageInfo'),
  metrics: document.getElementById('metrics'),
  searchInput: document.getElementById('searchInput'),
  yearFilter: document.getElementById('yearFilter'),
  careerFilter: document.getElementById('careerFilter'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modalTitle'),
  dynamicForm: document.getElementById('dynamicForm'),
  skeleton: document.getElementById('skeleton')
};

const schema = {
  alumnos: ['nombre', 'documento', 'correo'],
  carreras: ['nombre', 'codigo', 'duracion'],
  periodos: ['nombre', 'anio'],
  clases: ['codigo', 'nombre', 'carreraId', 'periodoId', 'cupo']
};

let state = {
  tab: 'alumnos',
  page: 1,
  editingId: null,
  db: loadDB()
};

function uid() {
  return crypto.randomUUID();
}

function loadDB() {
  const base = {
    alumnos: [],
    carreras: [],
    periodos: [],
    clases: [],
    matriculas: []
  };
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return base;
  try {
    return { ...base, ...JSON.parse(raw) };
  } catch {
    return base;
  }
}

function saveDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(state.db));
}

function toast(message, isError = false) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.style.background = isError ? 'var(--danger)' : 'var(--text)';
  node.classList.remove('hidden');
  setTimeout(() => node.classList.add('hidden'), 2200);
}

function init() {
  bindEvents();
  hydrateFilters();
  render();
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.nav-item.active')?.classList.remove('active');
      btn.classList.add('active');
      state.tab = btn.dataset.tab;
      state.page = 1;
      render();
    });
  });

  document.getElementById('newRecord').addEventListener('click', () => openModal());
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('prevPage').addEventListener('click', () => {
    if (state.page > 1) state.page--;
    render();
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    state.page++;
    render();
  });

  ui.searchInput.addEventListener('input', () => {
    state.page = 1;
    render();
  });
  ui.yearFilter.addEventListener('change', render);
  ui.careerFilter.addEventListener('change', render);

  document.getElementById('toggleTheme').addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });

  document.getElementById('exportData').addEventListener('click', exportJSON);
  document.getElementById('importFile').addEventListener('change', importJSON);
}

function hydrateFilters() {
  const years = [...new Set(state.db.periodos.map(p => p.anio))].sort();
  ui.yearFilter.innerHTML = '<option value="">Todos los años</option>' + years.map(y => `<option>${y}</option>`).join('');

  ui.careerFilter.innerHTML = '<option value="">Todas las carreras</option>' +
    state.db.carreras.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
}

function render() {
  ui.skeleton.classList.remove('hidden');
  setTimeout(() => ui.skeleton.classList.add('hidden'), 350);

  renderMetrics();
  ui.panelTitle.textContent = state.tab[0].toUpperCase() + state.tab.slice(1);

  if (state.tab === 'matriculas') {
    renderMatriculas();
    return;
  }

  const records = filteredRecords(state.tab);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * PAGE_SIZE;
  const pageRows = records.slice(start, start + PAGE_SIZE);
  ui.pageInfo.textContent = `Página ${state.page} de ${totalPages}`;

  const columns = schema[state.tab];
  ui.tableHead.innerHTML = `<tr>${columns.map(c => `<th>${c}</th>`).join('')}<th>Acciones</th></tr>`;
  ui.tableBody.innerHTML = pageRows.map(record => rowTemplate(record, columns)).join('');

  bindRowActions();
}

function filteredRecords(tab) {
  let records = [...state.db[tab]];
  const term = ui.searchInput.value.trim().toLowerCase();
  if (term) {
    records = records.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(term)));
  }

  if (tab === 'clases') {
    if (ui.yearFilter.value) {
      const ids = state.db.periodos.filter(p => String(p.anio) === ui.yearFilter.value).map(p => p.id);
      records = records.filter(c => ids.includes(c.periodoId));
    }
    if (ui.careerFilter.value) {
      records = records.filter(c => c.carreraId === ui.careerFilter.value);
    }
  }
  return records;
}

function rowTemplate(record, columns) {
  return `<tr>
    ${columns.map(c => `<td>${formatValue(c, record[c])}</td>`).join('')}
    <td class="actions">
      <button class="btn ghost" data-edit="${record.id}">Editar</button>
      <button class="btn ghost" data-del="${record.id}">Eliminar</button>
    </td>
  </tr>`;
}

function formatValue(field, value) {
  if (field === 'carreraId') return state.db.carreras.find(c => c.id === value)?.nombre || '-';
  if (field === 'periodoId') return state.db.periodos.find(p => p.id === value)?.nombre || '-';
  return value;
}

function bindRowActions() {
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => removeRecord(btn.dataset.del));
  });
}

function openModal(id = null) {
  if (state.tab === 'matriculas') {
    openEnrollmentModal();
    return;
  }

  state.editingId = id;
  const fields = schema[state.tab];
  const data = id ? state.db[state.tab].find(r => r.id === id) : {};

  ui.modalTitle.textContent = id ? `Editar ${state.tab}` : `Nuevo ${state.tab}`;
  ui.dynamicForm.innerHTML = fields.map(field => fieldInput(field, data[field])).join('') +
    '<button class="btn primary" type="submit">Guardar</button>';

  ui.dynamicForm.onsubmit = e => {
    e.preventDefault();
    saveForm(new FormData(ui.dynamicForm));
  };

  ui.modal.classList.remove('hidden');
}

function fieldInput(field, value = '') {
  const selectFields = {
    carreraId: state.db.carreras,
    periodoId: state.db.periodos
  };

  if (selectFields[field]) {
    const options = selectFields[field]
      .map(opt => `<option value="${opt.id}" ${value === opt.id ? 'selected' : ''}>${opt.nombre}</option>`)
      .join('');
    return `<div class="form-row"><label>${field}</label><select name="${field}" required><option value="">Seleccione...</option>${options}</select></div>`;
  }

  const type = ['cupo', 'duracion', 'anio'].includes(field) ? 'number' : 'text';
  return `<div class="form-row"><label>${field}</label><input type="${type}" name="${field}" value="${value ?? ''}" required /></div>`;
}

function saveForm(formData) {
  const tab = state.tab;
  const payload = Object.fromEntries(formData.entries());

  if (tab === 'alumnos' && state.db.alumnos.some(a => a.documento === payload.documento && a.id !== state.editingId)) {
    return toast('Documento duplicado', true);
  }
  if (tab === 'clases' && state.db.clases.some(c => c.codigo === payload.codigo && c.id !== state.editingId)) {
    return toast('Código de clase duplicado', true);
  }

  if (state.editingId) {
    state.db[tab] = state.db[tab].map(r => (r.id === state.editingId ? { ...r, ...payload } : r));
    toast('Registro actualizado');
  } else {
    state.db[tab].push({ id: uid(), ...payload });
    toast('Registro creado');
  }

  persistAndRefresh();
  closeModal();
}

function removeRecord(id) {
  const tab = state.tab;

  if (tab === 'carreras' && state.db.clases.some(c => c.carreraId === id)) {
    return toast('No se puede eliminar: carrera con clases activas', true);
  }
  if (tab === 'periodos' && (state.db.clases.some(c => c.periodoId === id) || state.db.matriculas.some(m => m.periodoId === id))) {
    return toast('No se puede eliminar: periodo con dependencias', true);
  }

  state.db[tab] = state.db[tab].filter(r => r.id !== id);
  if (tab === 'clases') state.db.matriculas = state.db.matriculas.filter(m => m.claseId !== id);

  toast('Registro eliminado');
  persistAndRefresh();
}

function renderMatriculas() {
  ui.tableHead.innerHTML = '<tr><th>Alumno</th><th>Clase</th><th>Periodo</th><th>Acciones</th></tr>';
  ui.pageInfo.textContent = `${state.db.matriculas.length} matrícula(s)`;

  const rows = state.db.matriculas.map(m => {
    const alumno = state.db.alumnos.find(a => a.id === m.alumnoId)?.nombre || '-';
    const clase = state.db.clases.find(c => c.id === m.claseId)?.nombre || '-';
    const periodo = state.db.periodos.find(p => p.id === m.periodoId)?.nombre || '-';
    return `<tr><td>${alumno}</td><td>${clase}</td><td>${periodo}</td><td><button class="btn ghost" data-del-mat="${m.id}">Eliminar</button></td></tr>`;
  }).join('');

  ui.tableBody.innerHTML = rows || '<tr><td colspan="4">Sin matrículas</td></tr>';
  document.querySelectorAll('[data-del-mat]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.db.matriculas = state.db.matriculas.filter(m => m.id !== btn.dataset.delMat);
      persistAndRefresh();
      toast('Matrícula eliminada');
    });
  });
}

function openEnrollmentModal() {
  ui.modalTitle.textContent = 'Nueva matrícula';
  ui.dynamicForm.innerHTML = `
    <div class="form-row"><label>Alumno</label><select name="alumnoId" required>
      <option value="">Seleccione...</option>${state.db.alumnos.map(a => `<option value="${a.id}">${a.nombre}</option>`).join('')}
    </select></div>
    <div class="form-row"><label>Clase</label><select name="claseId" required>
      <option value="">Seleccione...</option>${state.db.clases.map(c => `<option value="${c.id}">${c.codigo} - ${c.nombre}</option>`).join('')}
    </select></div>
    <button class="btn primary" type="submit">Matricular</button>
  `;

  ui.dynamicForm.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(ui.dynamicForm).entries());
    const clase = state.db.clases.find(c => c.id === data.claseId);
    if (!clase) return;

    const ocupadas = state.db.matriculas.filter(m => m.claseId === data.claseId).length;
    if (ocupadas >= Number(clase.cupo)) return toast('Clase sin cupos disponibles', true);

    if (state.db.matriculas.some(m => m.alumnoId === data.alumnoId && m.periodoId === clase.periodoId)) {
      return toast('El alumno ya está matriculado en este periodo', true);
    }

    state.db.matriculas.push({ id: uid(), ...data, periodoId: clase.periodoId });
    toast('Matrícula registrada');
    persistAndRefresh();
    closeModal();
  };

  ui.modal.classList.remove('hidden');
}

function renderMetrics() {
  const availableSeats = state.db.clases.reduce((acc, c) => {
    const used = state.db.matriculas.filter(m => m.claseId === c.id).length;
    return acc + Math.max(0, Number(c.cupo) - used);
  }, 0);

  const cards = [
    ['Alumnos', state.db.alumnos.length],
    ['Carreras', state.db.carreras.length],
    ['Clases', state.db.clases.length],
    ['Matrículas', state.db.matriculas.length],
    ['Cupos libres', availableSeats]
  ];

  ui.metrics.innerHTML = cards.map(([label, value]) => `<article class="card"><h4>${label}</h4><p>${value}</p></article>`).join('');
}

function closeModal() {
  ui.modal.classList.add('hidden');
  state.editingId = null;
}

function persistAndRefresh() {
  saveDB();
  hydrateFilters();
  render();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state.db, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'sga_respaldo.json';
  link.click();
  URL.revokeObjectURL(link.href);
  toast('Exportación completada');
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.alumnos || !data.carreras || !data.periodos || !data.clases || !data.matriculas) {
        throw new Error('Formato inválido');
      }
      state.db = data;
      persistAndRefresh();
      toast('Importación exitosa');
    } catch {
      toast('JSON inválido', true);
    }
  };
  reader.readAsText(file);
}

init();
