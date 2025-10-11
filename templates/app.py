import sqlite3
from pathlib import Path
from typing import Dict, Any

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

"""
app.py
---------

This module implements a minimal web server using FastAPI to power a SQL-driven dashboard.
The server exposes endpoints to retrieve database schemas and execute arbitrary SQL queries
against configured SQLite databases. It also serves a modern web interface built with
Bootstrap, DataTables and Chart.js for interacting with these APIs.

The two example databases (flights.db and transactions.db) are automatically created on
startup with sample data so that the application is ready to use immediately.
"""

# Directory where this script resides
BASE_DIR = Path(__file__).resolve().parent

app = FastAPI()

# Mount static files (CSS, JS, images)
static_dir = BASE_DIR / 'static'
app.mount('/static', StaticFiles(directory=static_dir), name='static')

# Set up Jinja2 templates
templates = Jinja2Templates(directory=str(BASE_DIR / 'templates'))

# Define available databases. Each key maps to a SQLite filename relative to BASE_DIR.
DATABASES: Dict[str, str] = {
    "flights": str(BASE_DIR / 'flights.db'),
    "transactions": str(BASE_DIR / 'transactions.db'),
}


def get_connection(db_name: str) -> sqlite3.Connection:
    """Return a SQLite connection for the given database name."""
    if db_name not in DATABASES:
        raise ValueError(f"Database '{db_name}' not found.")
    conn = sqlite3.connect(DATABASES[db_name])
    conn.row_factory = sqlite3.Row
    return conn


def query_database(db_name: str, query: str) -> Dict[str, Any]:
    """
    Execute a SQL query against the specified database and return a dictionary
    containing success flag, column names, data rows and error message if any.
    """
    try:
        conn = get_connection(db_name)
        cur = conn.cursor()
        cur.execute(query)
        rows = cur.fetchall()
        column_names = [description[0] for description in cur.description] if cur.description else []
        data = [list(row) for row in rows]
        return {
            "success": True,
            "columns": column_names,
            "data": data,
            "error": None,
        }
    except sqlite3.Error as e:
        return {
            "success": False,
            "columns": [],
            "data": [],
            "error": str(e),
        }
    finally:
        if 'conn' in locals():
            conn.close()


def get_schema() -> Dict[str, Dict[str, Any]]:
    """
    Retrieve the schema for all configured databases. Returns a nested dictionary
    keyed by database name and then table name, with a list of columns.
    """
    schema: Dict[str, Dict[str, Any]] = {}
    for db_name, db_path in DATABASES.items():
        schema[db_name] = {}
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        tables = [row[0] for row in cur.fetchall()]
        for table in tables:
            cur.execute(f"PRAGMA table_info('{table}')")
            rows = cur.fetchall()
            # Build a list of HTML strings with column name and colored type badge
            columns_with_types = []
            for row in rows:
                # row format: (cid, name, type, notnull, dflt_value, pk)
                col_name = row[1]
                col_type = row[2].upper() if row[2] else ''
                # Determine bootstrap color class based on type
                # Default color if type not recognized
                color_class = 'secondary'
                if any(keyword in col_type for keyword in ['INT', 'REAL', 'NUM']):
                    color_class = 'primary'
                elif any(keyword in col_type for keyword in ['CHAR', 'TEXT', 'CLOB']):
                    color_class = 'success'
                elif any(keyword in col_type for keyword in ['DATE', 'TIME']):
                    color_class = 'warning'
                elif any(keyword in col_type for keyword in ['BLOB', 'BOOL']):
                    color_class = 'info'
                # Build HTML representation
                html_repr = f"{col_name} <span class='badge bg-{color_class} ms-1'>{col_type}</span>"
                columns_with_types.append(html_repr)
            schema[db_name][table] = columns_with_types
        conn.close()
    return schema


def create_example_databases():
    """
    Create and populate the example SQLite databases with sample data. This function
    can be called multiple times safely; it drops any existing tables before inserting
    new data to avoid duplicate entries.
    """
    # Flights database
    conn = sqlite3.connect(DATABASES['flights'])
    cur = conn.cursor()
    # Drop existing table to avoid duplicates
    cur.execute("DROP TABLE IF EXISTS flights")
    cur.execute('''
        CREATE TABLE flights (
            flight_id INTEGER PRIMARY KEY AUTOINCREMENT,
            airline TEXT,
            origin TEXT,
            destination TEXT,
            departure_date TEXT,
            arrival_date TEXT,
            status TEXT,
            price REAL
        )
    ''')
    flights_data = [
        ('Air Blue', 'São Paulo', 'Rio de Janeiro', '2025-01-10', '2025-01-10', 'On Time', 150.0),
        ('Air Green', 'Rio de Janeiro', 'São Paulo', '2025-01-11', '2025-01-11', 'Delayed', 200.0),
        ('Air Red', 'Brasília', 'São Paulo', '2025-02-05', '2025-02-05', 'Cancelled', 300.0),
        ('Air Blue', 'São Paulo', 'Brasília', '2025-03-15', '2025-03-15', 'On Time', 220.0),
        ('Air Green', 'Curitiba', 'São Paulo', '2025-04-20', '2025-04-20', 'On Time', 180.0),
        ('Air Red', 'São Paulo', 'Curitiba', '2025-05-30', '2025-05-30', 'On Time', 160.0),
        ('Air Yellow', 'Rio de Janeiro', 'Brasília', '2025-06-12', '2025-06-12', 'Delayed', 250.0),
        ('Air Blue', 'Brasília', 'Rio de Janeiro', '2025-07-22', '2025-07-22', 'On Time', 210.0),
        ('Air Yellow', 'Curitiba', 'Rio de Janeiro', '2025-08-05', '2025-08-05', 'Cancelled', 230.0),
        ('Air Green', 'São Paulo', 'Curitiba', '2025-09-10', '2025-09-10', 'On Time', 190.0)
    ]
    cur.executemany('''
        INSERT INTO flights (airline, origin, destination, departure_date, arrival_date, status, price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', flights_data)
    conn.commit()
    conn.close()

    # Transactions database
    conn = sqlite3.connect(DATABASES['transactions'])
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS transactions")
    cur.execute('''
        CREATE TABLE transactions (
            transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            merchant TEXT,
            category TEXT,
            amount REAL,
            card_type TEXT,
            location TEXT
        )
    ''')
    transactions_data = [
        ('2025-01-15', 'Supermercado SP', 'Groceries', 120.50, 'Visa', 'São Paulo'),
        ('2025-01-20', 'Restaurante RJ', 'Dining', 80.75, 'MasterCard', 'Rio de Janeiro'),
        ('2025-02-12', 'Posto de Gasolina', 'Fuel', 50.00, 'Visa', 'Brasília'),
        ('2025-02-28', 'Loja de Roupas', 'Clothing', 200.00, 'Amex', 'Curitiba'),
        ('2025-03-10', 'Cinema SP', 'Entertainment', 45.00, 'Visa', 'São Paulo'),
        ('2025-04-05', 'Farmácia RJ', 'Pharmacy', 60.00, 'MasterCard', 'Rio de Janeiro'),
        ('2025-05-14', 'Academia', 'Fitness', 120.00, 'Amex', 'São Paulo'),
        ('2025-06-18', 'Livraria', 'Books', 75.25, 'Visa', 'Brasília'),
        ('2025-07-07', 'Hotel', 'Travel', 500.00, 'MasterCard', 'Curitiba'),
        ('2025-08-19', 'Loja Eletrônica', 'Electronics', 350.00, 'Amex', 'São Paulo'),
        ('2025-09-30', 'Restaurante Brasília', 'Dining', 90.00, 'Visa', 'Brasília'),
        ('2025-10-05', 'Supermercado RJ', 'Groceries', 130.75, 'MasterCard', 'Rio de Janeiro'),
        ('2025-10-15', 'Festa', 'Entertainment', 200.00, 'Amex', 'São Paulo'),
        ('2025-11-01', 'Serviços', 'Utilities', 180.00, 'Visa', 'Curitiba'),
        ('2025-11-20', 'Transporte', 'Transport', 30.50, 'MasterCard', 'Rio de Janeiro')
    ]
    cur.executemany('''
        INSERT INTO transactions (date, merchant, category, amount, card_type, location)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', transactions_data)
    conn.commit()
    conn.close()


@app.on_event('startup')
def startup_event():
    """Initialize databases on application startup."""
    create_example_databases()


@app.get('/', response_class=HTMLResponse)
async def root(request: Request):
    """Serve the main dashboard page."""
    return templates.TemplateResponse('index.html', { 'request': request })


@app.get('/api/schema')
async def api_schema():
    """Return the database schemas."""
    return JSONResponse(get_schema())


@app.post('/api/query')
async def api_query(request: Request):
    """Execute a SQL query against a selected database."""
    body = await request.json()
    db_name = body.get('db')
    query = body.get('query')
    if not db_name or not query:
        raise HTTPException(status_code=400, detail="Missing 'db' or 'query' parameter.")
    result = query_database(db_name, query)
    return JSONResponse(result)


if __name__ == '__main__':
    import uvicorn
    # Create databases explicitly when run directly
    create_example_databases()
    uvicorn.run(app, host='0.0.0.0', port=5000)