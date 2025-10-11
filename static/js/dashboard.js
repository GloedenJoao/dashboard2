// dashboard.js
// This script handles the dynamic interactions of the SQL Dashboard Builder.

$(document).ready(function() {
    // Global state
    let schema = {};
    let currentQueryResult = null; // {columns: [], data: []}
    let cards = []; // Array of dashboard cards
    let cardCounter = 0; // Unique ID counter for cards
    let filters = []; // Array of active filters {column, value}
    let savedDashboards = [];
    let saveDashboardModal = null;

    function getFiltersFromUI() {
        const collected = [];
        $('#filters-container .filter-row').each(function() {
            const column = $(this).find('.filter-column-select').val();
            const value = $(this).find('.filter-value-input').val().trim();
            if (column && value) {
                collected.push({ column, value });
            }
        });
        return collected;
    }

    function showDashboardMessage(message, type = 'success') {
        const alertBox = $('#dashboard-feedback');
        if (!alertBox.length) return;
        alertBox.removeClass('d-none alert-success alert-danger alert-info');
        alertBox.addClass(`alert-${type}`);
        alertBox.text(message);
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                alertBox.addClass('d-none');
            }, 4000);
        }
    }

    function escapeHtml(text) {
        return $('<div>').text(text == null ? '' : text).html();
    }

    function getSerializableCards() {
        return cards.map(card => ({
            id: card.id,
            db: card.db,
            query: card.query,
            type: card.type,
            title: card.title,
            config: card.config,
            data: card.data,
            columns: card.columns
        }));
    }

    function renderSavedDashboardsList() {
        const container = $('#saved-dashboards-list');
        container.empty();
        if (savedDashboards.length === 0) {
            container.append('<div class="list-group-item text-muted">Nenhum dashboard salvo até o momento.</div>');
            return;
        }
        savedDashboards.forEach(dashboard => {
            const updatedAt = dashboard.updated_at ? new Date(dashboard.updated_at).toLocaleString('pt-BR') : '';
            const safeName = escapeHtml(dashboard.name || 'Sem nome');
            const safeTimestamp = escapeHtml(updatedAt);
            const timestampMarkup = updatedAt ? `<small class="text-muted">Atualizado em ${safeTimestamp}</small>` : '';
            const item = $(`
                <div class="list-group-item d-flex align-items-center justify-content-between gap-3">
                    <div>
                        <h6 class="mb-1">${safeName}</h6>
                        ${timestampMarkup}
                    </div>
                    <button class="btn btn-sm btn-primary">Carregar</button>
                </div>
            `);
            item.find('button').on('click', function() {
                loadDashboard(dashboard);
            });
            container.append(item);
        });
    }

    function loadSavedDashboards() {
        $.getJSON('/api/dashboards', function(data) {
            savedDashboards = Array.isArray(data) ? data : [];
            renderSavedDashboardsList();
        });
    }

    function loadDashboard(dashboard) {
        if (!dashboard || !Array.isArray(dashboard.cards)) {
            showDashboardMessage('Não foi possível carregar o dashboard selecionado.', 'danger');
            return;
        }
        cards.forEach(card => {
            if (card.chart) {
                card.chart.destroy();
            }
        });
        $('#dashboard-cards').empty();
        cards = dashboard.cards.map((card, index) => ({
            id: card.id || `card-${index}`,
            db: card.db,
            query: card.query,
            type: card.type,
            title: card.title,
            config: card.config || {},
            data: card.data || [],
            columns: card.columns || [],
            chart: null
        }));
        const nextCounter = cards.reduce((max, card) => {
            if (typeof card.id === 'string') {
                const match = card.id.match(/card-(\d+)/);
                if (match) {
                    return Math.max(max, parseInt(match[1], 10) + 1);
                }
            }
            return max;
        }, 0);
        cardCounter = Math.max(nextCounter, cards.length);
        cards.forEach(card => renderCard(card));
        updateFilterOptions();

        $('#filters-container').empty();
        filters = Array.isArray(dashboard.filters) ? dashboard.filters.map(filter => ({
            column: filter.column,
            value: filter.value
        })) : [];
        filters.forEach(filter => addFilterRow(filter));
        filters = getFiltersFromUI();
        if (filters.length > 0) {
            applyFilters(true);
            showDashboardMessage(`Dashboard "${dashboard.name}" carregado e filtros aplicados.`, 'info');
        } else {
            refreshCardsData();
            showDashboardMessage(`Dashboard "${dashboard.name}" carregado.`, 'info');
        }
        const dashboardTabEl = document.getElementById('dashboard-tab');
        if (dashboardTabEl) {
            const tabInstance = bootstrap.Tab.getOrCreateInstance(dashboardTabEl);
            tabInstance.show();
        }
    }

    // Fetch schema and populate sidebar and DB select
    function loadSchema() {
        $.getJSON('/api/schema', function(data) {
            schema = data;
            populateSchemaSidebar();
            populateDbSelect();
        });
    }

    function populateSchemaSidebar() {
        const container = $('#schema-container');
        container.empty();
        let idx = 0;
        for (const dbName in schema) {
            const dbId = `db-${idx}`;
            const headerId = `heading-${idx}`;
            const collapseId = `collapse-${idx}`;
            const card = $(
                `<div class="accordion-item">
                    <h2 class="accordion-header" id="${headerId}">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                            ${dbName}
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="${headerId}" data-bs-parent="#schema-container">
                        <div class="accordion-body p-0">
                            <div class="list-group list-group-flush" id="${dbId}"></div>
                        </div>
                    </div>
                </div>`
            );
            container.append(card);
            const listGroup = $(`#${dbId}`);
            const tables = schema[dbName];
            for (const tableName in tables) {
                const columns = tables[tableName].join(', ');
                const item = $(
                    `<a href="#" class="list-group-item list-group-item-action">
                        <strong>${tableName}</strong><br><small>${columns}</small>
                    </a>`
                );
                listGroup.append(item);
            }
            idx++;
        }
    }

    function populateDbSelect() {
        const select = $('#db-select');
        select.empty();
        for (const dbName in schema) {
            select.append(`<option value="${dbName}">${dbName}</option>`);
        }
        // select the first DB by default
        select.val(Object.keys(schema)[0]);
    }

    // Execute query when form submitted
    $('#query-form').on('submit', function(event) {
        event.preventDefault();
        const db = $('#db-select').val();
        let query = $('#sql-input').val().trim();
        if (!query) {
            alert('Por favor, insira uma consulta SQL.');
            return;
        }
        executeQuery(db, query, function(result) {
            if (!result.success) {
                alert('Erro na consulta: ' + result.error);
                return;
            }
            currentQueryResult = {
                db: db,
                query: query,
                columns: result.columns,
                data: result.data
            };
            displayQueryResult(currentQueryResult);
        });
    });

    function executeQuery(db, query, callback) {
        $.ajax({
            url: '/api/query',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ db: db, query: query }),
            success: function(resp) {
                callback(resp);
            },
            error: function(xhr) {
                callback({ success: false, error: xhr.responseJSON ? xhr.responseJSON.error : 'Erro desconhecido.' });
            }
        });
    }

    function displayQueryResult(result) {
        // Show panel
        $('#query-result-panel').removeClass('d-none');
        // Destroy previous table if exists
        if ($.fn.DataTable.isDataTable('#query-result-table')) {
            $('#query-result-table').DataTable().destroy();
            $('#query-result-table').empty();
        }
        // Build DataTable
        $('#query-result-table').DataTable({
            data: result.data,
            columns: result.columns.map(col => ({ title: col })),
            paging: true,
            searching: true,
            info: false,
            ordering: true,
            scrollX: true,
            autoWidth: false
        });
        // Populate visualization config selects
        populateVisualizationConfig(result);
        // Reset preview and selections
        $('#vis-type-select').val('table');
        $('#card-title').val('');
        toggleVisConfigControls();
        updatePreview();
    }

    function populateVisualizationConfig(result) {
        const columns = result.columns;
        const categorySelect = $('#category-column');
        const valueSelect = $('#value-column');
        categorySelect.empty();
        valueSelect.empty();
        // Populate both selects with column names; numeric detection for value columns
        // Determine numeric columns by checking first 5 rows or until find numeric value
        const numericCols = new Set();
        columns.forEach((col, colIndex) => {
            for (let i = 0; i < result.data.length && i < 5; i++) {
                const val = result.data[i][colIndex];
                if (val !== null && !isNaN(parseFloat(val))) {
                    numericCols.add(col);
                    break;
                }
            }
        });
        columns.forEach(col => {
            categorySelect.append(`<option value="${col}">${col}</option>`);
            if (numericCols.has(col)) {
                valueSelect.append(`<option value="${col}">${col}</option>`);
            }
        });
    }

    // When visualization type changes
    $('#vis-type-select').on('change', function() {
        toggleVisConfigControls();
        updatePreview();
    });
    $('#category-column, #value-column, #kpi-aggregation').on('change', function() {
        updatePreview();
    });

    function toggleVisConfigControls() {
        const visType = $('#vis-type-select').val();
        $('#category-column-group, #value-column-group, #kpi-aggregation-group').addClass('d-none');
        if (visType === 'bar' || visType === 'line' || visType === 'pie') {
            $('#category-column-group').removeClass('d-none');
            $('#value-column-group').removeClass('d-none');
        } else if (visType === 'kpi') {
            $('#value-column-group').removeClass('d-none');
            $('#kpi-aggregation-group').removeClass('d-none');
        }
    }

    // Chart objects associated with preview and cards
    let previewChart = null;

    function updatePreview() {
        if (!currentQueryResult) return;
        const visType = $('#vis-type-select').val();
        const previewDiv = $('#visualization-preview');
        // Clear previous preview
        previewDiv.empty();
        if (previewChart) {
            previewChart.destroy();
            previewChart = null;
        }
        if (visType === 'table') {
            // Preview is a small table
            const tableId = 'preview-table-' + Date.now();
            previewDiv.append(`<table id="${tableId}" class="table table-striped"></table>`);
            $('#' + tableId).DataTable({
                data: currentQueryResult.data,
                columns: currentQueryResult.columns.map(col => ({ title: col })),
                paging: false,
                searching: false,
                info: false,
                ordering: true,
                scrollX: true,
                autoWidth: false
            });
        } else if (visType === 'bar' || visType === 'line' || visType === 'pie') {
            const categoryCol = $('#category-column').val();
            const valueCol = $('#value-column').val();
            if (!categoryCol || !valueCol) {
                previewDiv.append('<p>Selecione colunas de categoria e valor.</p>');
                return;
            }
            const { labels, values } = aggregateData(currentQueryResult, categoryCol, valueCol);
            const canvasId = 'preview-chart-' + Date.now();
            previewDiv.append(`<canvas id="${canvasId}" height="300"></canvas>`);
            const ctx = document.getElementById(canvasId).getContext('2d');
            previewChart = new Chart(ctx, {
                type: visType === 'bar' ? 'bar' : visType === 'line' ? 'line' : 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        label: valueCol,
                        data: values,
                        backgroundColor: generateColors(labels.length),
                        borderColor: '#007bff',
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: visType === 'pie' ? {} : {
                        x: { title: { display: true, text: categoryCol } },
                        y: { title: { display: true, text: valueCol } }
                    }
                }
            });
        } else if (visType === 'kpi') {
            const valueCol = $('#value-column').val();
            const agg = $('#kpi-aggregation').val();
            if (!valueCol) {
                previewDiv.append('<p>Selecione a coluna de valor para KPI.</p>');
                return;
            }
            const kpiValue = calculateKpi(currentQueryResult, valueCol, agg);
            previewDiv.append(`<div class="p-4 bg-light border rounded text-center">
                <h2>${agg.toUpperCase()}</h2>
                <h1>${kpiValue}</h1>
                <h5>${valueCol}</h5>
            </div>`);
        }
    }

    // Aggregate data for bar/line/pie charts
    function aggregateData(result, categoryCol, valueCol) {
        const labels = [];
        const valuesMap = {};
        const colIndexCat = result.columns.indexOf(categoryCol);
        const colIndexVal = result.columns.indexOf(valueCol);
        result.data.forEach(row => {
            const cat = row[colIndexCat];
            const val = parseFloat(row[colIndexVal]) || 0;
            if (!valuesMap.hasOwnProperty(cat)) {
                valuesMap[cat] = 0;
                labels.push(cat);
            }
            valuesMap[cat] += val;
        });
        const values = labels.map(label => valuesMap[label]);
        return { labels, values };
    }

    // Calculate KPI value based on aggregation
    function calculateKpi(result, valueCol, aggregation) {
        const colIndex = result.columns.indexOf(valueCol);
        const values = result.data.map(row => parseFloat(row[colIndex]) || 0);
        if (aggregation === 'sum') {
            return values.reduce((a, b) => a + b, 0).toFixed(2);
        } else if (aggregation === 'avg') {
            if (values.length === 0) return 0;
            return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
        } else if (aggregation === 'count') {
            return values.length;
        } else if (aggregation === 'min') {
            return Math.min(...values);
        } else if (aggregation === 'max') {
            return Math.max(...values);
        }
        return 0;
    }

    // Generate an array of distinct colors
    function generateColors(n) {
        const colors = [];
        const palette = [
            '#007bff', '#28a745', '#ffc107', '#dc3545', '#6610f2', '#20c997', '#fd7e14', '#6f42c1', '#17a2b8', '#e83e8c'
        ];
        for (let i = 0; i < n; i++) {
            colors.push(palette[i % palette.length]);
        }
        return colors;
    }

    // Add to dashboard button
    $('#add-to-dashboard').on('click', function() {
        if (!currentQueryResult) {
            alert('Execute uma consulta antes de adicionar ao dashboard.');
            return;
        }
        const visType = $('#vis-type-select').val();
        const cardTitle = $('#card-title').val().trim() || 'Visualização';
        const categoryCol = $('#category-column').val();
        const valueCol = $('#value-column').val();
        const agg = $('#kpi-aggregation').val();
        // Validate required fields for chart types
        if ((visType === 'bar' || visType === 'line' || visType === 'pie') && (!categoryCol || !valueCol)) {
            alert('Selecione as colunas de categoria e valor.');
            return;
        }
        if (visType === 'kpi' && !valueCol) {
            alert('Selecione a coluna de valor para KPI.');
            return;
        }
        // Create card object
        const cardId = 'card-' + cardCounter++;
        const card = {
            id: cardId,
            db: currentQueryResult.db,
            query: currentQueryResult.query,
            type: visType,
            title: cardTitle,
            config: {
                categoryCol: categoryCol,
                valueCol: valueCol,
                aggregation: agg
            },
            data: currentQueryResult.data,
            columns: currentQueryResult.columns,
            chart: null // Will hold Chart.js instance for updating
        };
        cards.push(card);
        // Render card in dashboard
        renderCard(card);
        // Update filters options
        updateFilterOptions();
    });

    function renderCard(card) {
        const colDiv = $('<div class="col d-flex"></div>');
        const cardDiv = $(
            `<div class="card h-100 w-100" id="${card.id}">
                <div class="card-body">
                    <h5 class="card-title">${card.title}</h5>
                    <div class="chart-container" style="min-height: 300px;"></div>
                </div>
            </div>`
        );
        colDiv.append(cardDiv);
        $('#dashboard-cards').append(colDiv);
        renderCardContent(card);
    }

    function renderCardContent(card) {
        const cardDiv = $('#' + card.id);
        const container = cardDiv.find('.chart-container');
        container.empty();
        // Destroy previous chart if exists
        if (card.chart) {
            card.chart.destroy();
            card.chart = null;
        }
        if (card.type === 'table') {
            const tableId = card.id + '-table';
            container.append(`<table id="${tableId}" class="table table-striped"></table>`);
            $('#' + tableId).DataTable({
                data: card.data,
                columns: card.columns.map(col => ({ title: col })),
                paging: true,
                searching: true,
                info: false,
                ordering: true,
                scrollX: true,
                autoWidth: false
            });
        } else if (card.type === 'bar' || card.type === 'line' || card.type === 'pie') {
            const { labels, values } = aggregateData({ data: card.data, columns: card.columns }, card.config.categoryCol, card.config.valueCol);
            const canvasId = card.id + '-chart';
            container.append(`<canvas id="${canvasId}"></canvas>`);
            const ctx = document.getElementById(canvasId).getContext('2d');
            card.chart = new Chart(ctx, {
                type: card.type === 'bar' ? 'bar' : card.type === 'line' ? 'line' : 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        label: card.config.valueCol,
                        data: values,
                        backgroundColor: generateColors(labels.length),
                        borderColor: '#007bff',
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: card.type === 'pie' ? {} : {
                        x: { title: { display: true, text: card.config.categoryCol } },
                        y: { title: { display: true, text: card.config.valueCol } }
                    }
                }
            });
        } else if (card.type === 'kpi') {
            const kpiValue = calculateKpi({ data: card.data, columns: card.columns }, card.config.valueCol, card.config.aggregation);
            container.append(`<div class="p-4 bg-light border rounded text-center">
                <h2>${card.config.aggregation.toUpperCase()}</h2>
                <h1>${kpiValue}</h1>
                <h5>${card.config.valueCol}</h5>
            </div>`);
        }
    }

    // Filter handling
    $('#add-filter-btn').on('click', function() {
        addFilterRow();
        filters = getFiltersFromUI();
    });
    $('#apply-filters-btn').on('click', function() {
        applyFilters();
    });
    $('#clear-filters-btn').on('click', function() {
        clearFilters();
    });

    function updateFilterOptions() {
        // Determine union of columns from all cards
        const columnSet = new Set();
        cards.forEach(card => {
            card.columns.forEach(col => columnSet.add(col));
        });
        $('.filter-column-select').each(function() {
            const select = $(this);
            const currentValue = select.val();
            select.empty();
            columnSet.forEach(col => {
                select.append(`<option value="${col}">${col}</option>`);
            });
            if (columnSet.has(currentValue)) {
                select.val(currentValue);
            }
        });
    }

    function addFilterRow(existingFilter = null) {
        const filterRow = $(
            `<div class="row filter-row align-items-center">
                <div class="col-md-4 mb-2 mb-md-0">
                    <select class="form-select filter-column-select"></select>
                </div>
                <div class="col-md-5 mb-2 mb-md-0">
                    <input type="text" class="form-control filter-value-input" placeholder="Valor do filtro">
                </div>
                <div class="col-md-3 text-md-end">
                    <button type="button" class="btn btn-outline-danger btn-sm btn-remove-filter">Remover</button>
                </div>
            </div>`
        );
        $('#filters-container').append(filterRow);
        updateFilterOptions();
        if (existingFilter) {
            filterRow.find('.filter-column-select').val(existingFilter.column || '');
            filterRow.find('.filter-value-input').val(existingFilter.value || '');
        }
        filterRow.find('.filter-column-select').on('change', function() {
            filters = getFiltersFromUI();
        });
        filterRow.find('.filter-value-input').on('input', function() {
            filters = getFiltersFromUI();
        });
        filterRow.find('.btn-remove-filter').on('click', function() {
            filterRow.remove();
            filters = getFiltersFromUI();
        });
    }

    function refreshCardsData() {
        cards.forEach(card => {
            executeQuery(card.db, card.query, function(result) {
                if (result.success) {
                    card.data = result.data;
                    card.columns = result.columns;
                    renderCardContent(card);
                }
            });
        });
    }

    function clearFilters(showAlert = true) {
        $('#filters-container').empty();
        filters = [];
        refreshCardsData();
        if (showAlert) {
            showDashboardMessage('Filtros limpos e dados atualizados.', 'info');
        }
    }

    function applyFilters(silent = false) {
        filters = getFiltersFromUI();
        if (filters.length === 0) {
            refreshCardsData();
            if (!silent) {
                showDashboardMessage('Nenhum filtro definido. Os dados originais foram carregados.', 'info');
            }
            return;
        }
        cards.forEach(card => {
            let filteredQuery = `SELECT * FROM (${card.query}) AS subquery`;
            if (filters.length > 0) {
                const whereClauses = filters.map(f => {
                    const val = isNaN(f.value) ? `'${f.value}'` : f.value;
                    return `${f.column} = ${val}`;
                });
                filteredQuery += ' WHERE ' + whereClauses.join(' AND ');
            }
            executeQuery(card.db, filteredQuery, function(result) {
                if (result.success) {
                    card.data = result.data;
                    card.columns = result.columns;
                    renderCardContent(card);
                }
            });
        });
        if (!silent) {
            showDashboardMessage('Filtros aplicados com sucesso.', 'success');
        }
    }

    const saveModalEl = document.getElementById('saveDashboardModal');
    if (saveModalEl) {
        saveDashboardModal = new bootstrap.Modal(saveModalEl);
    }

    $('#save-dashboard-btn').on('click', function() {
        if (cards.length === 0) {
            showDashboardMessage('Adicione ao menos um card antes de salvar o dashboard.', 'danger');
            return;
        }
        $('#dashboard-name-input').val('');
        if (saveDashboardModal) {
            saveDashboardModal.show();
        }
    });

    $('#save-dashboard-form').on('submit', function(event) {
        event.preventDefault();
        const name = $('#dashboard-name-input').val().trim();
        filters = getFiltersFromUI();
        const cardPayload = getSerializableCards();
        if (!name) {
            showDashboardMessage('Informe um nome para salvar o dashboard.', 'danger');
            return;
        }
        if (cardPayload.length === 0) {
            showDashboardMessage('Adicione ao menos um card antes de salvar o dashboard.', 'danger');
            return;
        }
        $.ajax({
            url: '/api/dashboards',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ name: name, cards: cardPayload, filters: filters }),
            success: function() {
                if (saveDashboardModal) {
                    saveDashboardModal.hide();
                }
                $('#dashboard-name-input').val('');
                showDashboardMessage('Dashboard salvo com sucesso!', 'success');
                loadSavedDashboards();
            },
            error: function(xhr) {
                const errorMessage = xhr.responseJSON && xhr.responseJSON.detail ? xhr.responseJSON.detail : 'Não foi possível salvar o dashboard.';
                showDashboardMessage(errorMessage, 'danger');
            }
        });
    });

    loadSavedDashboards();

    // Initial load
    loadSchema();
});
