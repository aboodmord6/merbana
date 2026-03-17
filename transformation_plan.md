# JSON → SQLite Migration Plan (Option A)

---

## Phase 1 — Audit Current Data Structure

1. List every top-level key in the JSON document
2. For each key, determine its type: scalar, object, or array
3. For arrays, identify:
   - What fields each item contains
   - Which fields are always present vs optional
   - What data types each field holds (string, number, boolean, nested object, nested array)
4. For nested objects within arrays, flag them separately — they will need their own models
5. Identify all relationships: does any item reference another item by an ID field?
6. Identify all fields that are queried, filtered, or sorted on in the frontend
7. Document every mutation function and what fields it reads or writes

**Output:** A complete field inventory with types, optionality, and relationships — no schema yet, just facts.

---

## Phase 2 — Design the Schema (SQLAlchemy Models)

Only after Phase 1 is complete:

1. Map each array to a SQLAlchemy `Base` model class
2. Map each scalar/object at the root level to a single-row config model or columns in an existing model
3. For nested arrays within items, create a child model with a `ForeignKey` back to the parent and a `relationship()` on the parent
4. For nested objects within items (not arrays), decide: flatten into parent model columns, or separate model with a `relationship(uselist=False)`
5. Define `primary_key=True` on every model's ID column
6. Define `ForeignKey` constraints and `relationship()` fields for every relationship identified in Phase 1
7. Map each field's data type to an appropriate SQLAlchemy type (`String`, `Integer`, `Float`, `Boolean`, `DateTime`, `JSON`)
8. Mark optional fields as `nullable=True`, required fields as `nullable=False`
9. Add `Index()` on every field identified in Phase 1 step 6 as queried/filtered/sorted
10. Boolean fields map directly to SQLAlchemy `Boolean` — no manual `0`/`1` convention needed
11. Review the schema against every mutation function from Phase 1 step 7 — ensure every write maps cleanly to SQLAlchemy session operations

**Output:** Finalized SQLAlchemy model classes. Run `Base.metadata.create_all(engine)` to apply.

---

## Phase 3 — Build the Python API Layer (FastAPI + SQLAlchemy)

1. Add dependencies:
   ```
   fastapi
   uvicorn
   sqlalchemy
   alembic
   ```

2. Configure SQLAlchemy with a **synchronous** engine and session factory inside a FastAPI `lifespan` context manager. For a single-user pywebview desktop app, a sync engine avoids `aiosqlite` complexity and SQLite write-locking issues with no performance cost. Enable `foreign_keys=ON` via SQLAlchemy's engine events.

3. Define a router per entity (e.g. `routers/orders.py`, `routers/products.py`) mirroring the model structure from Phase 2.

4. For each entity, implement standard endpoints using FastAPI route decorators and SQLAlchemy session dependency injection:
   - `GET /api/{entity}` — `session.execute(select(Model))`
   - `GET /api/{entity}/{id}` — `session.get(Model, id)`
   - `POST /api/{entity}` — `session.add(Model(**data))`
   - `PUT /api/{entity}/{id}` — fetch then update attributes
   - `DELETE /api/{entity}/{id}` — `session.delete(obj)`

5. Define Pydantic schemas (`BaseModel`) for every entity's request and response — these serve as the validation and serialization layer on top of SQLAlchemy models.

6. Every write route is automatically wrapped in a transaction via SQLAlchemy's session context manager — commit on success, rollback on exception.

7. Implement `GET /api/db/export` — queries all models and returns a JSON structure matching the original `db.json` shape.

8. Implement `POST /api/db/import` — accepts the JSON payload, validates via Pydantic, and bulk-inserts using `session.add_all()` in dependency order inside a single transaction.

9. Replace `http.server` startup with:
   ```python
   import uvicorn
   uvicorn.run(app, host="127.0.0.1", port=port, log_level="error")
   ```
   Inject the assigned port into the pywebview window object (e.g. `window.__API_URL__ = "http://127.0.0.1:{port}"`) so the React API client uses an explicit absolute base URL instead of relative paths.

10. Mount static files for the React `dist/` folder **after** all API routers:
    ```python
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
    ```

11. Add FastAPI's CORS middleware scoped to `127.0.0.1` only.

---

## Phase 4 — Migrate the Frontend

1. Remove the `loadDatabase()` boot call that fetches and hydrates the full JSON blob
2. Remove the `persistToDisk()` / `sendBeacon` / full-db POST mechanism entirely
3. For each mutation function in `services/database.ts`, replace direct object mutation + `notify()` with an `async` API call to the corresponding endpoint
4. Abandon the custom pub-sub singleton entirely. Use **TanStack Query (React Query)** for all server state — it handles caching, loading states, background refetching, and cache invalidation after mutations automatically.
5. Update every component that reads from the in-memory `db` singleton to either fetch on mount or read from a cache invalidated after each mutation
6. Move `checkDailyReset()` logic to the Python layer, triggered on server startup or first request of the day
7. Remove `window.injectDatabase` if the full-blob injection model is no longer applicable

---

## Phase 5 — Data Migration (One-Time)

1. Write a migration script (Python) that:
   - Reads the existing `db.json`
   - Validates every field against Pydantic schemas from Phase 3
   - Inserts each entity using SQLAlchemy `session.add_all()` in dependency order
   - Logs any field that fails Pydantic validation
2. Run the script against a **copy** of `db.json`, never the original
3. After insertion, query row counts per model and compare against array lengths in the original JSON
4. Spot-check a sample of records from each model against the source JSON manually

---

## Phase 6 — Edge Case Handling

Address these before going live:

1. **Null / missing fields:** Handle via Pydantic field defaults or `Optional` typing — no manual per-field SQL decisions
2. **Empty arrays:** Models simply have zero rows — SQLAlchemy handles this transparently
3. **Orphaned references:** SQLAlchemy's `ForeignKey` with `foreign_keys=ON` will raise `IntegrityError` on insert — catch, log, and quarantine
4. **Duplicate IDs:** Pydantic validation or SQLAlchemy's `IntegrityError` on primary key conflict will surface these — resolve before bulk insert
5. **Boolean fields:** SQLAlchemy `Boolean` type handles this automatically — no manual normalization
6. **Date/time fields:** Use SQLAlchemy `DateTime` with Pydantic `datetime` type — ISO 8601 parsing is automatic
7. **Nested objects with no relational mapping:** Store as SQLAlchemy `JSON` column with a documented plan to normalize later

---

## Phase 7 — Integrity Validation

After migration and after going live:

1. SQLAlchemy's `foreign_keys=ON` engine event enforces referential integrity at the connection level — no manual PRAGMA calls needed
2. Run `PRAGMA integrity_check;` once post-migration to confirm no corruption
3. Verify row counts per model against source data
4. Re-run every existing unit test in `database.test.ts` and `database.persistence.test.ts` against the new API layer
5. Write integration tests: for each endpoint, test create → read → update → delete cycle
6. Test the daily reset logic end-to-end
7. Test the export endpoint output against the original `db.json` to confirm no data loss

---

## Phase 8 — Performance Baseline

1. Measure response time for the most frequently called endpoints under realistic data volumes
2. Confirm SQLAlchemy-defined `Index()` objects are being used — verify via `EXPLAIN QUERY PLAN` on the raw SQLite file if needed
3. For report-style queries that aggregate large tables, test with a realistic historical data size
4. Enable `PRAGMA journal_mode=WAL;` explicitly via SQLAlchemy's engine `connect` event — it is not set by default and must be applied on every connection.

---

## Phase 9 — Schema Migrations (Alembic)

1. Initialize Alembic: `alembic init alembic`
2. Point `alembic.ini` at the SQLite file path
3. For every future schema change, generate a migration: `alembic revision --autogenerate -m "description"`
4. Apply migrations: `alembic upgrade head`
5. Never manually alter the SQLite file — all schema changes go through Alembic revisions
6. Before any migration in production, export a JSON snapshot via `GET /api/db/export` as a rollback checkpoint

---

## Phase 10 — Rollback Plan

1. Keep `db.json` untouched until the system is fully validated in production
2. The `/api/db/export` endpoint is the rollback mechanism — it regenerates a valid `db.json` from SQLite at any time
3. If a rollback is needed: run export, revert Python launcher to the original single-endpoint version, point it back at the exported `db.json`
4. Document the SQLite file location in the deployment directory alongside where `db.json` previously lived