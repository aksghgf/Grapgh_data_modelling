"""
SAP Order-to-Cash data ingestion into Neo4j.

Loads CSV or JSONL files from subfolders under the SAP O2C data directory,
cleans property keys (snake_case), maps entities to the O2C graph model, and
uploads with MERGE in batches.

O2C flow modeled:
  Customer -> SalesOrder -> SalesOrderItem -> Product
  SalesOrderItem -> Delivery -> BillingDocument -> JournalEntry
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

from neo4j import GraphDatabase, Driver

BATCH_SIZE = 1000

# Default relative to project root (parent of scripts/)
_DEFAULT_DATA_DIRS = (
    Path("backend/data/sap-o2c-data"),
    Path("Backend/Data/sap-o2c-data"),
)


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _resolve_data_dir() -> Path:
    env = os.environ.get("SAP_O2C_DATA_DIR")
    if env:
        p = Path(env)
        if not p.is_absolute():
            p = _project_root() / p
        return p
    root = _project_root()
    for rel in _DEFAULT_DATA_DIRS:
        candidate = root / rel
        if candidate.is_dir() and any(candidate.iterdir()):
            return candidate
    return root / _DEFAULT_DATA_DIRS[0]


def to_snake_case(name: str) -> str:
    """Convert a string to lower_snake_case (handles camelCase segments)."""
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    s2 = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1)
    return s2.replace("-", "_").lower()


def clean_row_keys(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize keys to snake_case and serialize nested values for Neo4j properties."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        key = to_snake_case(k) if k else k
        if isinstance(v, (dict, list)):
            out[key] = json.dumps(v)
        elif v is None:
            out[key] = None
        else:
            out[key] = v
    return out


def normalize_sd_item(value: str | int | None) -> str:
    """Normalize SAP SD item numbers (e.g. '000010' -> '10')."""
    if value is None:
        return ""
    s = str(value).strip()
    if s.isdigit():
        return str(int(s))
    return s


def iter_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def iter_csv(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield {k: (v if v != "" else None) for k, v in row.items()}


def iter_records(path: Path) -> Iterator[dict[str, Any]]:
    suf = path.suffix.lower()
    if suf == ".jsonl":
        yield from iter_jsonl(path)
    elif suf == ".csv":
        yield from iter_csv(path)
    else:
        raise ValueError(f"Unsupported file type: {path}")


def discover_tabular_files(data_dir: Path) -> list[Path]:
    """Find CSV and JSONL files in immediate subfolders."""
    files: list[Path] = []
    if not data_dir.is_dir():
        return files
    for sub in sorted(data_dir.iterdir()):
        if not sub.is_dir():
            continue
        for p in sorted(sub.glob("*.csv")):
            files.append(p)
        for p in sorted(sub.glob("*.jsonl")):
            files.append(p)
    return files


def chunked(iterable: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(iterable), size):
        yield iterable[i : i + size]


def run_write(driver: Driver, query: str, rows: list[dict[str, Any]]) -> None:
    """Execute a batched write with UNWIND."""
    if not rows:
        return
    with driver.session() as session:
        session.execute_write(lambda tx: tx.run(query, rows=rows))


def merge_customers(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.customer_id IS NOT NULL AND row.customer_id <> ''
    MERGE (c:Customer {customer_id: row.customer_id})
    SET c += row
    """
    run_write(driver, q, rows)


def merge_sales_orders(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.sales_order IS NOT NULL AND row.sales_order <> ''
    MERGE (s:SalesOrder {sales_order: row.sales_order})
    SET s += row
    """
    run_write(driver, q, rows)


def merge_sales_order_items(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row
    WHERE row.sales_order IS NOT NULL AND row.sales_order_item IS NOT NULL
    MERGE (i:SalesOrderItem {
      sales_order: row.sales_order,
      sales_order_item: row.sales_order_item
    })
    SET i += row
    """
    run_write(driver, q, rows)


def merge_products(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.product IS NOT NULL AND row.product <> ''
    MERGE (p:Product {product: row.product})
    SET p += row
    """
    run_write(driver, q, rows)


def merge_deliveries(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.delivery_document IS NOT NULL AND row.delivery_document <> ''
    MERGE (d:Delivery {delivery_document: row.delivery_document})
    SET d += row
    """
    run_write(driver, q, rows)


def merge_billing_documents(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.billing_document IS NOT NULL AND row.billing_document <> ''
    MERGE (b:BillingDocument {billing_document: row.billing_document})
    SET b += row
    """
    run_write(driver, q, rows)


def merge_journal_entries(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row
    WHERE row.company_code IS NOT NULL AND row.fiscal_year IS NOT NULL
      AND row.accounting_document IS NOT NULL AND row.accounting_document_item IS NOT NULL
    MERGE (j:JournalEntry {
      journal_key: row.journal_key
    })
    SET j += row
    """
    run_write(driver, q, rows)


def rel_ordered(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.customer_id IS NOT NULL AND row.sales_order IS NOT NULL
    MATCH (c:Customer {customer_id: row.customer_id})
    MATCH (s:SalesOrder {sales_order: row.sales_order})
    MERGE (c)-[:ORDERED]->(s)
    """
    run_write(driver, q, rows)


def rel_has_item(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    MATCH (s:SalesOrder {sales_order: row.sales_order})
    MATCH (i:SalesOrderItem {sales_order: row.sales_order, sales_order_item: row.sales_order_item})
    MERGE (s)-[:HAS_ITEM]->(i)
    """
    run_write(driver, q, rows)


def rel_for_product(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.material IS NOT NULL AND row.material <> ''
    MATCH (i:SalesOrderItem {sales_order: row.sales_order, sales_order_item: row.sales_order_item})
    MATCH (p:Product {product: row.material})
    MERGE (i)-[:FOR_PRODUCT]->(p)
    """
    run_write(driver, q, rows)


def rel_delivers(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    MATCH (d:Delivery {delivery_document: row.delivery_document})
    MATCH (i:SalesOrderItem {sales_order: row.reference_sd_document, sales_order_item: row.reference_sd_document_item})
    MERGE (d)-[:DELIVERS]->(i)
    """
    run_write(driver, q, rows)


def rel_bills_delivery(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.reference_sd_document IS NOT NULL AND row.reference_sd_document <> ''
    MATCH (b:BillingDocument {billing_document: row.billing_document})
    MATCH (d:Delivery {delivery_document: row.reference_sd_document})
    MERGE (b)-[:BILLS]->(d)
    """
    run_write(driver, q, rows)


def rel_posted_as(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.accounting_document IS NOT NULL
    MATCH (b:BillingDocument {billing_document: row.billing_document})
    MATCH (j:JournalEntry {journal_key: row.journal_key})
    MERGE (b)-[:POSTED_AS]->(j)
    """
    run_write(driver, q, rows)


def rel_billed_to_customer(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.sold_to_party IS NOT NULL
    MATCH (c:Customer {customer_id: row.sold_to_party})
    MATCH (b:BillingDocument {billing_document: row.billing_document})
    MERGE (c)-[:BILLED_ON]->(b)
    """
    run_write(driver, q, rows)


def rel_journal_customer(driver: Driver, rows: list[dict[str, Any]]) -> None:
    q = """
    UNWIND $rows AS row
    WITH row WHERE row.customer_id IS NOT NULL
    MATCH (c:Customer {customer_id: row.customer_id})
    MATCH (j:JournalEntry {journal_key: row.journal_key})
    MERGE (c)-[:AR_ENTRY]->(j)
    """
    run_write(driver, q, rows)


# Folder name -> logical bucket used by `load_folder_entities()`.
# The dataset is expected to be organized as:
#   backend/data/sap-o2c-data/<folder>/*.csv or *.jsonl
FOLDER_HANDLERS: dict[str, str] = {
    # Nodes
    "business_partners": "customers",
    "sales_order_headers": "sales_orders",
    "sales_order_items": "sales_order_items",
    "products": "products",
    "outbound_delivery_headers": "deliveries",
    "billing_document_headers": "billing_documents",
    "journal_entry_items_accounts_receivable": "journal_entries",
    # Relationships (via reference documents/items)
    "outbound_delivery_items": "outbound_delivery_items",
    "billing_document_items": "billing_document_items",
}


def load_folder_entities(
    data_dir: Path,
) -> dict[str, list[dict[str, Any]]]:
    """Load and transform rows per logical entity bucket."""
    buckets: dict[str, list[dict[str, Any]]] = {
        "customers": [],
        "sales_orders": [],
        "sales_order_items": [],
        "products": [],
        "deliveries": [],
        "outbound_delivery_items": [],
        "billing_documents": [],
        "billing_document_items": [],
        "journal_entries": [],
    }

    for path in discover_tabular_files(data_dir):
        folder = path.parent.name
        if folder not in FOLDER_HANDLERS:
            continue
        for raw in iter_records(path):
            row = clean_row_keys(raw)
            if folder == "business_partners":
                cid = row.get("customer") or row.get("business_partner")
                if not cid:
                    continue
                row["customer_id"] = str(cid)
                buckets["customers"].append(row)
            elif folder == "sales_order_headers":
                row["sales_order"] = str(row.get("sales_order", "")).strip()
                buckets["sales_orders"].append(row)
            elif folder == "sales_order_items":
                row["sales_order"] = str(row.get("sales_order", "")).strip()
                row["sales_order_item"] = normalize_sd_item(row.get("sales_order_item"))
                buckets["sales_order_items"].append(row)
            elif folder == "products":
                buckets["products"].append(row)
            elif folder == "outbound_delivery_headers":
                buckets["deliveries"].append(row)
            elif folder == "outbound_delivery_items":
                buckets["outbound_delivery_items"].append(
                    {
                        "delivery_document": str(row.get("delivery_document", "")),
                        "reference_sd_document": str(row.get("reference_sd_document", "")),
                        "reference_sd_document_item": normalize_sd_item(
                            row.get("reference_sd_document_item")
                        ),
                    }
                )
            elif folder == "billing_document_headers":
                buckets["billing_documents"].append(row)
            elif folder == "billing_document_items":
                ref_sd = row.get("reference_sd_document")
                buckets["billing_document_items"].append(
                    {
                        "billing_document": str(row.get("billing_document", "")),
                        "reference_sd_document": str(ref_sd) if ref_sd else "",
                    }
                )
            elif folder == "journal_entry_items_accounts_receivable":
                cc = row.get("company_code")
                fy = row.get("fiscal_year")
                ad = row.get("accounting_document")
                ai = row.get("accounting_document_item")
                if not all([cc, fy, ad, ai]):
                    continue
                jk = f"{cc}|{fy}|{ad}|{ai}"
                row["journal_key"] = jk
                cust = row.get("customer")
                if cust:
                    row["customer_id"] = str(cust)
                buckets["journal_entries"].append(row)

    return buckets


def ingest(driver: Driver, data_dir: Path) -> None:
    """Run full ingestion pipeline."""
    print(f"Data directory: {data_dir}")
    if not data_dir.is_dir():
        print(f"ERROR: Data directory does not exist: {data_dir}", file=sys.stderr)
        sys.exit(1)

    buckets = load_folder_entities(data_dir)

    node_merges: list[tuple[str, Callable[[Driver, list[dict[str, Any]]], None]]] = [
        ("customers", merge_customers),
        ("sales_orders", merge_sales_orders),
        ("sales_order_items", merge_sales_order_items),
        ("products", merge_products),
        ("deliveries", merge_deliveries),
        ("billing_documents", merge_billing_documents),
        ("journal_entries", merge_journal_entries),
    ]

    for name, fn in node_merges:
        rows = buckets.get(name, [])
        print(f"Merging {name}: {len(rows)} rows")
        for batch in chunked(rows, BATCH_SIZE):
            fn(driver, batch)

    # Relationships: Customer -ORDERED-> SalesOrder
    so_rows: list[dict[str, Any]] = []
    for r in buckets["sales_orders"]:
        sold = r.get("sold_to_party")
        so = r.get("sales_order")
        if sold and so:
            so_rows.append({"customer_id": str(sold), "sales_order": str(so)})
    print(f"Relationship ORDERED: {len(so_rows)}")
    for batch in chunked(so_rows, BATCH_SIZE):
        rel_ordered(driver, batch)

    # HAS_ITEM
    hi: list[dict[str, Any]] = []
    for r in buckets["sales_order_items"]:
        hi.append(
            {
                "sales_order": str(r.get("sales_order", "")),
                "sales_order_item": str(r.get("sales_order_item", "")),
            }
        )
    print(f"Relationship HAS_ITEM: {len(hi)}")
    for batch in chunked(hi, BATCH_SIZE):
        rel_has_item(driver, batch)

    # FOR_PRODUCT
    fp: list[dict[str, Any]] = []
    for r in buckets["sales_order_items"]:
        m = r.get("material")
        if not m:
            continue
        fp.append(
            {
                "sales_order": str(r.get("sales_order", "")),
                "sales_order_item": str(r.get("sales_order_item", "")),
                "material": str(m),
            }
        )
    print(f"Relationship FOR_PRODUCT: {len(fp)}")
    for batch in chunked(fp, BATCH_SIZE):
        rel_for_product(driver, batch)

    # DELIVERS (Delivery -> SalesOrderItem)
    od = buckets["outbound_delivery_items"]
    print(f"Relationship DELIVERS: {len(od)}")
    for batch in chunked(od, BATCH_SIZE):
        rel_delivers(driver, batch)

    # BILLS (BillingDocument -> Delivery)
    bi = buckets["billing_document_items"]
    print(f"Relationship BILLS: {len(bi)}")
    for batch in chunked(bi, BATCH_SIZE):
        rel_bills_delivery(driver, batch)

    # POSTED_AS (BillingDocument -> JournalEntry)
    posted: list[dict[str, Any]] = []
    for jr in buckets["journal_entries"]:
        ad = jr.get("accounting_document")
        if not ad:
            continue
        for bd in buckets["billing_documents"]:
            if str(bd.get("accounting_document")) == str(ad) and str(
                bd.get("company_code")
            ) == str(jr.get("company_code")) and str(bd.get("fiscal_year")) == str(
                jr.get("fiscal_year")
            ):
                posted.append(
                    {
                        "billing_document": str(bd.get("billing_document")),
                        "journal_key": str(jr.get("journal_key")),
                    }
                )
    print(f"Relationship POSTED_AS: {len(posted)}")
    for batch in chunked(posted, BATCH_SIZE):
        rel_posted_as(driver, batch)

    # BILLED_ON (Customer -> BillingDocument)
    bt: list[dict[str, Any]] = []
    for bd in buckets["billing_documents"]:
        st = bd.get("sold_to_party")
        bid = bd.get("billing_document")
        if st and bid:
            bt.append({"sold_to_party": str(st), "billing_document": str(bid)})
    print(f"Relationship BILLED_ON: {len(bt)}")
    for batch in chunked(bt, BATCH_SIZE):
        rel_billed_to_customer(driver, batch)

    # AR_ENTRY (Customer -> JournalEntry)
    ar: list[dict[str, Any]] = []
    for jr in buckets["journal_entries"]:
        cid = jr.get("customer_id")
        jk = jr.get("journal_key")
        if cid and jk:
            ar.append({"customer_id": str(cid), "journal_key": str(jk)})
    print(f"Relationship AR_ENTRY: {len(ar)}")
    for batch in chunked(ar, BATCH_SIZE):
        rel_journal_customer(driver, batch)

    print("Ingestion complete.")


def ensure_constraints(driver: Driver) -> None:
    """Create uniqueness constraints for MERGE keys (idempotent)."""
    stmts = [
        "CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.customer_id IS UNIQUE",
        "CREATE CONSTRAINT sales_order_id IF NOT EXISTS FOR (s:SalesOrder) REQUIRE s.sales_order IS UNIQUE",
        "CREATE CONSTRAINT so_item_id IF NOT EXISTS FOR (i:SalesOrderItem) REQUIRE (i.sales_order, i.sales_order_item) IS UNIQUE",
        "CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.product IS UNIQUE",
        "CREATE CONSTRAINT delivery_id IF NOT EXISTS FOR (d:Delivery) REQUIRE d.delivery_document IS UNIQUE",
        "CREATE CONSTRAINT billing_id IF NOT EXISTS FOR (b:BillingDocument) REQUIRE b.billing_document IS UNIQUE",
        "CREATE CONSTRAINT journal_key IF NOT EXISTS FOR (j:JournalEntry) REQUIRE j.journal_key IS UNIQUE",
    ]
    with driver.session() as session:
        for cypher in stmts:
            try:
                session.run(cypher)
            except Exception as e:
                print(f"Constraint note: {e}")


def main() -> None:
    uri = os.environ.get("NEO4J_URI") or "bolt://localhost:7687"
    user = os.environ.get("NEO4J_USER") or os.environ.get("NEO4J_USERNAME") or "neo4j"
    password = os.environ.get("NEO4J_PASSWORD") or ""
    if not password:
        print("ERROR: Set `NEO4J_PASSWORD` in the environment.", file=sys.stderr)
        sys.exit(1)

    data_dir = _resolve_data_dir()
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        ensure_constraints(driver)
        ingest(driver, data_dir)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
