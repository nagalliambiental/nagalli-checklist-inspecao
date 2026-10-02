"""Verifica a migração v9 contra um banco no estado v8, com nomes de empresa
redundantes. Roda o mesmo SQL usado no app e confere se os empreendimentos
foram criados, fundidos e vinculados, sem duplicar áreas homônimas."""

import json
import re
import sqlite3
import sys
import unicodedata

V8_SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cnpj TEXT, segment TEXT, synced_at INTEGER
);
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL, address TEXT, city TEXT, state TEXT
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  template_id TEXT NOT NULL,
  site_id TEXT,
  area_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  inspector_name TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inspection_items (
  id TEXT PRIMARY KEY NOT NULL, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  template_item_id TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  area_id TEXT, area_name TEXT, group_name TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL, company_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

BACKFILL_SQL = """
INSERT OR IGNORE INTO empreendimentos (id, name, contratante, address, active, created_at, updated_at)
SELECT
  'emp_' || lower(replace(trim(COALESCE(company_name, '')), ' ', '_')),
  trim(company_name),
  trim(company_name),
  '',
  1,
  MIN(created_at),
  MAX(updated_at)
FROM inspections
WHERE TRIM(COALESCE(company_name, '')) <> ''
GROUP BY lower(trim(company_name))
"""

UPDATE_SQL = """
UPDATE inspections
SET empreendimento_id = 'emp_' || lower(replace(trim(COALESCE(company_name, '')), ' ', '_')),
    empreendimento_name = trim(company_name)
WHERE TRIM(COALESCE(company_name, '')) <> ''
"""


NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_name_key(value: str) -> str:
    """Espelha o normalizeNameKey do app: NFD, sem diacríticos, minúsculas e
    apenas sequências de a-z0-9 (o `+` colapsa espaços repetidos)."""
    decomposed = unicodedata.normalize("NFD", value)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return NON_ALNUM.sub(" ", stripped.lower()).strip()


def build_db():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(V8_SCHEMA)
    db.executescript(
        "ALTER TABLE inspections ADD COLUMN company_name TEXT;"
        "ALTER TABLE inspections ADD COLUMN address TEXT;"
    )
    db.execute("INSERT INTO companies (id, name) VALUES ('seed-company', 'CBB')")
    db.execute("INSERT INTO templates (id, company_id, name) VALUES ('tpl', 'seed-company', 'Checklist')")

    # Mesma área ("Sala de Máquinas") em nomes que devem virar 1 empreendimento,
    # mais um empreendimento distinto e uma vistoria sem empresa.
    vistorias = [
        ("i1", "Condominio Aurora", "Sala de Máquinas", "2026-08-01"),
        ("i2", "Condomínio Aurora", "Sala de Máquinas", "2026-09-01"),
        ("i3", "  condominio   aurora  ", "Sala de Máquinas", "2026-10-01"),
        ("i4", "Edificio Beta", "Sala de Máquinas", "2026-09-15"),
        ("i5", "", "Cobertura", "2026-09-20"),
    ]
    for vid, empresa, area, data in vistorias:
        db.execute(
            """INSERT INTO inspections
               (id, company_id, template_id, area_id, area_name, inspector_name, date, status,
                company_name, created_at, updated_at)
               VALUES (?, 'seed-company', 'tpl', 'a1', ?, 'Tecnico', ?, 'draft', ?, 1000, 2000)""",
            (vid, area, data, empresa),
        )

    itens = [
        ("it1", "i1", "NC", "Sala de Máquinas"),
        ("it2", "i2", "C", "Sala de Máquinas"),
        ("it3", "i4", "C", "Sala de Máquinas"),
        ("it4", "i5", "C", "Cobertura"),
    ]
    for iid, vid, status, area in itens:
        db.execute(
            """INSERT INTO inspection_items
               (id, inspection_id, template_item_id, label, status, area_id, area_name, created_at, updated_at)
               VALUES (?, ?, 'ti', 'Item', ?, 'a1', ?, 1000, 2000)""",
            (iid, vid, status, area),
        )

    db.execute(
        """INSERT INTO action_items (id, type, inspection_id, item_id, company_name, created_at, updated_at)
           VALUES ('ac1', 'NC', 'i1', 'it1', 'Condominio Aurora', 1000, 2000)"""
    )
    return db


def migrate_v9(db):
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS empreendimentos (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          contratante TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        ALTER TABLE inspections ADD COLUMN empreendimento_id TEXT;
        ALTER TABLE inspections ADD COLUMN empreendimento_name TEXT;
        """
    )
    db.executescript(BACKFILL_SQL)
    db.executescript(UPDATE_SQL)

    # Fusão de variantes com acento/caixa, que o lower() do SQLite não resolve.
    keepers = {}
    for emp_id, nome in db.execute("SELECT id, name FROM empreendimentos ORDER BY created_at, name"):
        chave = normalize_name_key(nome)
        guardiao = keepers.get(chave)
        if guardiao is None:
            if chave:
                keepers[chave] = (emp_id, nome)
            continue
        db.execute(
            """UPDATE inspections
               SET empreendimento_id = ?, empreendimento_name = ?, company_name = ?
               WHERE empreendimento_id = ?""",
            (guardiao[0], guardiao[1], guardiao[1], emp_id),
        )
        db.execute(
            """UPDATE action_items SET company_name = ?
               WHERE inspection_id IN (SELECT id FROM inspections WHERE empreendimento_id = ?)""",
            (guardiao[1], emp_id),
        )
        db.execute("DELETE FROM empreendimentos WHERE id = ?", (emp_id,))


CASES = [
    "Condominio Aurora",
    "Condomínio Aurora",
    "  condominio   aurora  ",
    "Edificio Beta",
    "Condomínio Edifício Aurora",
    "CONDOMÍNIO AURORA",
    "Edificio  Aurora",
    "Rua 5 de Outubro, 120",
    "Cond. Aurora",
    "",
]


def main():
    if "--keys" in sys.argv:
        for c in CASES:
            print(json.dumps(normalize_name_key(c)))
        return

    db = build_db()
    migrate_v9(db)

    falhas = []

    def check(label, obtained, expected):
        if obtained != expected:
            falhas.append(f"  - {label}\n      esperado: {expected!r}\n      obtido:   {obtained!r}")

    emps = db.execute("SELECT id, name, contratante, active FROM empreendimentos ORDER BY name").fetchall()
    check(
        "3 nomes variantes viram 1 empreendimento, Beta separado",
        [e[1] for e in emps],
        ["Condominio Aurora", "Edificio Beta"],
    )
    check("contratante preenchido pelo backfill", emps[0][2], "Condominio Aurora")
    check("todos ativos", all(e[3] == 1 for e in emps), True)

    vistorias = {r[0]: r for r in db.execute("SELECT id, empreendimento_id, empreendimento_name FROM inspections")}
    alvo = vistorias["i1"][1]
    check(
        "as 3 vistórias do Aurora apontam para o mesmo empreendimento",
        [vistorias["i1"][1], vistorias["i2"][1], vistorias["i3"][1]],
        [alvo, alvo, alvo],
    )
    check("nome normalizado propagado para a vistoria com espaços extras", vistorias["i3"][2], "Condominio Aurora")
    check("Edificio Beta tem empreendimento próprio", vistorias["i4"][2], "Edificio Beta")
    check("vistoria sem empresa fica sem empreendimento", vistorias["i5"][1], None)
    check(
        "action_items acompanha o nome do guardião",
        db.execute("SELECT company_name FROM action_items WHERE id='ac1'").fetchone()[0],
        "Condominio Aurora",
    )

    # A vista de conformidade não pode mais fundir áreas homônimas.
    por_empreendimento = db.execute(
        """SELECT i.empreendimento_name, it.area_name, it.status
           FROM inspections i JOIN inspection_items it ON it.inspection_id = i.id
           WHERE i.empreendimento_id IS NOT NULL AND it.status <> 'pending'
           ORDER BY i.empreendimento_name, it.status"""
    ).fetchall()
    check(
        "área homônima não é fundida entre empreendimentos",
        por_empreendimento,
        [
            ("Condominio Aurora", "Sala de Máquinas", "C"),
            ("Condominio Aurora", "Sala de Máquinas", "NC"),
            ("Edificio Beta", "Sala de Máquinas", "C"),
        ],
    )

    antes = db.execute("SELECT COUNT(*) FROM empreendimentos").fetchone()[0]
    db.executescript(BACKFILL_SQL)
    check(
        "reexecutar o backfill não duplica empreendimentos",
        db.execute("SELECT COUNT(*) FROM empreendimentos").fetchone()[0],
        antes,
    )

    if falhas:
        print("FALHOU:\n" + "\n".join(falhas))
        raise SystemExit(1)
    print(
        f"OK: migracao v9 validada "
        f"({antes} empreendimentos, {len(vistorias)} vistorias, {len(por_empreendimento)} itens)."
    )


if __name__ == "__main__":
    main()
