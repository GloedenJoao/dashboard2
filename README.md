# Dashboard FastAPI

Este projeto disponibiliza uma aplicação web construída com **FastAPI** que oferece uma interface para exploração de dados armazenados em bancos SQLite de exemplo (`flights.db` e `transactions.db`). A aplicação inclui páginas HTML renderizadas com Jinja2, arquivos estáticos (CSS/JS) e endpoints REST para consultas dinâmicas.

## Requisitos

- Python 3.10 ou superior
- Dependências listadas em `requirements.txt`

## Instalação

1. Crie e ative um ambiente virtual (opcional, mas recomendado):
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Linux ou macOS
   .venv\\Scripts\\activate  # Windows
   ```
2. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```

## Como executar

1. Certifique-se de estar com o ambiente virtual ativado (se aplicável).
2. Inicialize o servidor usando o Uvicorn:
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8000 --reload
   ```
3. Acesse a aplicação pelo navegador em: [http://localhost:8000](http://localhost:8000)

Durante a inicialização, os bancos de dados de exemplo são criados automaticamente com dados fictícios para exploração imediata.

## Estrutura do projeto

```
.
├── app.py             # Aplicação FastAPI
├── static/            # Arquivos estáticos (CSS, JS, imagens)
├── templates/         # Templates HTML (Jinja2)
├── flights.db         # Banco SQLite gerado automaticamente
├── transactions.db    # Banco SQLite gerado automaticamente
├── requirements.txt   # Dependências Python
└── README.md          # Este arquivo
```

## Endpoints principais

- `GET /` - Página inicial do dashboard.
- `GET /api/schema` - Retorna o esquema dos bancos configurados.
- `POST /api/query` - Executa consultas SQL personalizadas.
- `GET /api/dashboards` - Lista dashboards salvos.
- `POST /api/dashboards` - Persiste um novo dashboard.

## Desenvolvendo

- Ao modificar arquivos estáticos ou templates, o recarregamento automático do Uvicorn (`--reload`) aplicará as alterações sem reiniciar manualmente o servidor.
- As bases SQLite são recriadas a cada inicialização para manter dados consistentes de demonstração.

## Licença

Este projeto é fornecido como exemplo educacional. Ajuste conforme necessário para o seu caso de uso.
