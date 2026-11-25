import os
import json
import sqlite3
import logging
from typing import Generator, Dict, Any, Optional

logger = logging.getLogger("surya_sankalp.database")

DATABASE_URL = os.getenv("DATABASE_URL")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_DB_PATH = os.path.join(BASE_DIR, "solar.db")

# Strict check for Correction 1:
# SQLite should be default ONLY when DATABASE_URL is not explicitly configured.
# If PostgreSQL is explicitly configured and its connection fails, return a clear startup error.
if DATABASE_URL and DATABASE_URL.strip():
    db_target = DATABASE_URL.strip()
    logger.info(f"Explicit DATABASE_URL configured: {db_target[:18]}...")
    if "postgres" in db_target:
        try:
            import psycopg2  # or psycopg
            conn = psycopg2.connect(db_target)
            conn.close()
            logger.info("Successfully connected to explicitly configured PostgreSQL database.")
        except ImportError as e:
            raise RuntimeError(
                f"Database connection to explicitly configured DATABASE_URL failed: PostgreSQL driver (psycopg2/psycopg) is not installed in the environment. "
                "Install psycopg2-binary or unset DATABASE_URL to use the default SQLite database."
            ) from e
        except Exception as e:
            raise RuntimeError(
                f"Database connection to explicitly configured DATABASE_URL failed: {e}. "
                "Please verify that the PostgreSQL server is running and credentials are valid."
            ) from e
    else:
        logger.info(f"Using configured database URL: {db_target}")
else:
    logger.info(f"DATABASE_URL not configured. Using default local SQLite database at: {SQLITE_DB_PATH}")

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(SQLITE_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firebase_uid TEXT UNIQUE,
        auth_provider TEXT NOT NULL DEFAULT 'local',
        firstname TEXT,
        lastname TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Polygons table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS polygons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        firebase_uid TEXT,
        session_id TEXT,
        coordinates TEXT NOT NULL,
        location_name TEXT,
        image_path TEXT,
        image_url TEXT,
        source_bounds TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );
    """)
    # Migration safeguard for existing database files
    try:
        cursor.execute("ALTER TABLE polygons ADD COLUMN location_name TEXT;")
        conn.commit()
    except Exception:
        pass

    # 3. Rooftop detections table (stores true polygon contours & area)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rooftop_detections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        polygon_id INTEGER NOT NULL,
        confidence REAL NOT NULL,
        polygon_points TEXT NOT NULL,
        pixel_area REAL NOT NULL,
        real_area_m2 REAL,
        conversion_method TEXT NOT NULL,
        uncertainty_status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (polygon_id) REFERENCES polygons (id) ON DELETE CASCADE
    );
    """)

    # 4. Solar estimations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS solar_estimations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        firebase_uid TEXT,
        session_id TEXT,
        polygon_id INTEGER,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        efficiency REAL NOT NULL,
        rooftop_area_m2 REAL NOT NULL,
        usable_area_factor REAL NOT NULL DEFAULT 0.70,
        usable_area_m2 REAL NOT NULL,
        annual_energy_potential REAL NOT NULL,
        data_origin TEXT NOT NULL,
        is_fallback INTEGER NOT NULL DEFAULT 0,
        fallback_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (polygon_id) REFERENCES polygons (id)
    );
    """)

    # 5. Versioned & Traceable DISCOM Tariffs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS discom_tariffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state_code TEXT NOT NULL,
        state_name TEXT NOT NULL,
        discom_code TEXT NOT NULL,
        discom_name TEXT NOT NULL,
        consumer_category TEXT NOT NULL,
        tariff_order_ref TEXT NOT NULL,
        source_url TEXT NOT NULL,
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        version TEXT NOT NULL,
        billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
        fixed_charge_rules TEXT NOT NULL,
        energy_slabs TEXT NOT NULL,
        electricity_duty_per_kwh REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 6. Official Sourced Subsidy Rules
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subsidy_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scheme_name TEXT NOT NULL,
        scheme_authority TEXT NOT NULL,
        state_category TEXT NOT NULL,
        consumer_category TEXT NOT NULL,
        cfa_rules_json TEXT NOT NULL,
        max_cfa_cap REAL NOT NULL,
        guideline_ref TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    """)

    # 7. State-Specific Metering Regulations
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS metering_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state_code TEXT NOT NULL,
        discom_code TEXT NOT NULL,
        metering_type TEXT NOT NULL,
        regulation_order_ref TEXT NOT NULL,
        capacity_cap_pct_sanctioned REAL NOT NULL,
        settlement_frequency TEXT NOT NULL,
        export_settlement_rate REAL NOT NULL,
        minimum_bill_logic TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    """)

    # 8. Documented Benchmark Capital Costs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS benchmark_costs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capacity_min_kw REAL NOT NULL,
        capacity_max_kw REAL NOT NULL,
        benchmark_cost_per_kw REAL NOT NULL,
        source_order TEXT NOT NULL,
        effective_year TEXT NOT NULL
    );
    """)

    # 9. Persistent Financial Assessments
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        estimation_id INTEGER NOT NULL,
        polygon_id INTEGER,
        state_code TEXT NOT NULL,
        discom_code TEXT NOT NULL,
        consumer_category TEXT NOT NULL,
        sanctioned_load_kw REAL NOT NULL,
        recommended_capacity_kw REAL NOT NULL,
        binding_constraint TEXT NOT NULL,
        gross_system_cost REAL NOT NULL,
        cfa_subsidy_amount REAL NOT NULL,
        net_consumer_investment REAL NOT NULL,
        self_consumption_scenario TEXT NOT NULL,
        self_consumption_factor REAL NOT NULL,
        monthly_bill_before_solar REAL NOT NULL,
        monthly_bill_after_solar REAL NOT NULL,
        annual_electricity_savings REAL NOT NULL,
        simple_payback_years REAL,
        twenty_five_year_net_savings REAL,
        rules_version_used TEXT NOT NULL,
        calculation_trace_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (estimation_id) REFERENCES solar_estimations (id)
    );
    """)

    conn.commit()
    seed_regulatory_data(conn)
    conn.close()
    logger.info("Database schema initialized and verified.")

def seed_regulatory_data(conn: sqlite3.Connection):
    cursor = conn.cursor()

    # 1. Seed Telangana Tariffs (TGERC Retail Supply Tariff Order FY 2026-27, Effective 01-04-2026 to 31-03-2027)
    # Clear prior outdated tariff rows for TGSPDCL to ensure clean transition
    cursor.execute("DELETE FROM discom_tariffs WHERE discom_code = 'TGSPDCL'")
    logger.info("Seeding verified Telangana TGERC / TGSPDCL FY 2026-27 tariff schedules...")
    
    # TGSPDCL Domestic LT-I (FY 2026-27: 401-800 units @ ₹9.50/kWh, >800 units @ ₹10.00/kWh)
    energy_slabs_tg_domestic = [
        {"tier": "LT-1(A)", "min_units": 0, "max_units": 50, "rate": 1.95},
        {"tier": "LT-1(A)", "min_units": 51, "max_units": 100, "rate": 3.10},
        {"tier": "LT-1(B)(i)", "min_units": 0, "max_units": 100, "rate": 3.40},
        {"tier": "LT-1(B)(i)", "min_units": 101, "max_units": 200, "rate": 4.80},
        {"tier": "LT-1(B)(ii)", "min_units": 0, "max_units": 200, "rate": 5.10},
        {"tier": "LT-1(B)(ii)", "min_units": 201, "max_units": 300, "rate": 7.70},
        {"tier": "LT-1(B)(ii)", "min_units": 301, "max_units": 400, "rate": 9.00},
        {"tier": "LT-1(B)(ii)", "min_units": 401, "max_units": 800, "rate": 9.50},
        {"tier": "LT-1(B)(ii)", "min_units": 801, "max_units": 999999, "rate": 10.00}
    ]
    
    fixed_rules_tg_domestic = {
        "group_a_monthly_fixed": 25.0,
        "group_b1_monthly_fixed": 50.0,
        "group_b2_per_kw_monthly": 10.0,
        "single_phase_minimum": 25.0,
        "three_phase_minimum": 50.0
    }

    cursor.execute("""
        INSERT INTO discom_tariffs (
            state_code, state_name, discom_code, discom_name, consumer_category,
            tariff_order_ref, source_url, effective_from, effective_to, version, billing_cycle,
            fixed_charge_rules, energy_slabs, electricity_duty_per_kwh
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "TG", "Telangana", "TGSPDCL", "Southern Power Distribution Company of Telangana Limited",
        "residential_individual", "TGERC Retail Supply Tariff Order FY 2026-27",
        "https://tgsouthernpower.org/resources/PDF/Tariffs/69tarifffile.pdf", "2026-04-01", "2027-03-31",
        "FY2026-27_V1", "MONTHLY",
        json.dumps(fixed_rules_tg_domestic), json.dumps(energy_slabs_tg_domestic), 0.06
    ))

    # TGSPDCL Commercial LT-II(A) Non-Domestic
    energy_slabs_tg_comm = [
        {"tier": "LT-2(A)", "min_units": 0, "max_units": 50, "rate": 7.00},
        {"tier": "LT-2(B)", "min_units": 51, "max_units": 999999, "rate": 11.50}
    ]
    fixed_rules_tg_comm = {"per_kw_monthly": 75.0}

    cursor.execute("""
        INSERT INTO discom_tariffs (
            state_code, state_name, discom_code, discom_name, consumer_category,
            tariff_order_ref, source_url, effective_from, effective_to, version, billing_cycle,
            fixed_charge_rules, energy_slabs, electricity_duty_per_kwh
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "TG", "Telangana", "TGSPDCL", "Southern Power Distribution Company of Telangana Limited",
        "commercial", "TGERC Retail Supply Tariff Order FY 2026-27",
        "https://tgsouthernpower.org/resources/PDF/Tariffs/69tarifffile.pdf", "2026-04-01", "2027-03-31",
        "FY2026-27_V1", "MONTHLY",
        json.dumps(fixed_rules_tg_comm), json.dumps(energy_slabs_tg_comm), 0.06
    ))

    # 2. Seed Official Subsidy Rules (PM Surya Ghar: Muft Bijli Yojana, Feb 2024)
    cursor.execute("SELECT COUNT(*) as cnt FROM subsidy_rules WHERE scheme_name = 'PM Surya Ghar: Muft Bijli Yojana'")
    if cursor.fetchone()["cnt"] == 0:
        logger.info("Seeding official PM Surya Ghar Central Financial Assistance (CFA) rules...")
        
        # General States Individual Residential
        cfa_general_res = [
            {"tier_min_kw": 0.0, "tier_max_kw": 2.0, "rate_per_kw": 30000.0},
            {"tier_min_kw": 2.0, "tier_max_kw": 3.0, "rate_per_kw": 18000.0},
            {"tier_min_kw": 3.0, "tier_max_kw": 999999.0, "rate_per_kw": 0.0}
        ]
        cursor.execute("""
            INSERT INTO subsidy_rules (
                scheme_name, scheme_authority, state_category, consumer_category,
                cfa_rules_json, max_cfa_cap, guideline_ref, effective_date, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "PM Surya Ghar: Muft Bijli Yojana", "MNRE, Government of India", "GENERAL",
            "residential_individual", json.dumps(cfa_general_res), 78000.0,
            "MNRE OM No. 318/331/2023-GCRT (Feb 2024)", "2024-02-15", 1
        ))

        # Special Category States Individual Residential
        cfa_special_res = [
            {"tier_min_kw": 0.0, "tier_max_kw": 2.0, "rate_per_kw": 33000.0},
            {"tier_min_kw": 2.0, "tier_max_kw": 3.0, "rate_per_kw": 19800.0},
            {"tier_min_kw": 3.0, "tier_max_kw": 999999.0, "rate_per_kw": 0.0}
        ]
        cursor.execute("""
            INSERT INTO subsidy_rules (
                scheme_name, scheme_authority, state_category, consumer_category,
                cfa_rules_json, max_cfa_cap, guideline_ref, effective_date, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "PM Surya Ghar: Muft Bijli Yojana", "MNRE, Government of India", "SPECIAL",
            "residential_individual", json.dumps(cfa_special_res), 85800.0,
            "MNRE OM No. 318/331/2023-GCRT (Feb 2024)", "2024-02-15", 1
        ))

        # GHS / RWA Residential (Common Facilities)
        cfa_rwa = [
            {"tier_min_kw": 0.0, "tier_max_kw": 500.0, "rate_per_kw": 18000.0}
        ]
        cursor.execute("""
            INSERT INTO subsidy_rules (
                scheme_name, scheme_authority, state_category, consumer_category,
                cfa_rules_json, max_cfa_cap, guideline_ref, effective_date, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "PM Surya Ghar: Muft Bijli Yojana", "MNRE, Government of India", "GENERAL",
            "residential_rwa_ghs", json.dumps(cfa_rwa), 9000000.0,
            "MNRE OM No. 318/331/2023-GCRT (Feb 2024)", "2024-02-15", 1
        ))

    # 3. Seed Metering & Settlement Regulations (TGERC Regulation No. 1 of 2025 & Proceeding 29-12-2025 @ ₹2.57/kWh)
    cursor.execute("DELETE FROM metering_rules WHERE discom_code = 'TGSPDCL'")
    logger.info("Seeding TGERC Rooftop Solar Regulation No. 1 of 2025 & Proceeding dated 29-12-2025 (APPC ₹2.57/kWh)...")
    min_bill_tg = {"monthly_minimum_units": 0, "maintain_customer_charge": True}
    
    # Residential & Government Net Metering (Max 100% of sanctioned load)
    cursor.execute("""
        INSERT INTO metering_rules (
            state_code, discom_code, metering_type, regulation_order_ref,
            capacity_cap_pct_sanctioned, settlement_frequency, export_settlement_rate,
            minimum_bill_logic, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "TG", "TGSPDCL", "NET_METERING_RESIDENTIAL_GOVT",
        "TGERC Rooftop Solar Regulation No. 1 of 2025 & Proceeding dated 29-12-2025 (₹2.57/kWh)",
        100.0, "TWICE_YEARLY", 2.57, json.dumps(min_bill_tg), 1
    ))

    # Commercial & Industrial Net Metering (Max 80% of sanctioned load / contracted demand)
    cursor.execute("""
        INSERT INTO metering_rules (
            state_code, discom_code, metering_type, regulation_order_ref,
            capacity_cap_pct_sanctioned, settlement_frequency, export_settlement_rate,
            minimum_bill_logic, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "TG", "TGSPDCL", "NET_METERING_COMMERCIAL_INDUSTRIAL",
        "TGERC Rooftop Solar Regulation No. 1 of 2025 & Proceeding dated 29-12-2025 (₹2.57/kWh)",
        80.0, "TWICE_YEARLY", 2.57, json.dumps(min_bill_tg), 1
    ))

    # Group Net Metering Rules
    cursor.execute("""
        INSERT INTO metering_rules (
            state_code, discom_code, metering_type, regulation_order_ref,
            capacity_cap_pct_sanctioned, settlement_frequency, export_settlement_rate,
            minimum_bill_logic, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "TG", "TGSPDCL", "GROUP_NET_METERING",
        "TGERC Regulation No. 1 of 2025 - Clause on Multi-Service Interconnection",
        100.0, "ANNUAL", 2.57, json.dumps({"description": "Surplus solar adjusted against consumer's other DISCOM service connections"}), 1
    ))

    # Virtual Net Metering Rules
    cursor.execute("""
        INSERT INTO metering_rules (
            state_code, discom_code, metering_type, regulation_order_ref,
            capacity_cap_pct_sanctioned, settlement_frequency, export_settlement_rate,
            minimum_bill_logic, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "TG", "TGSPDCL", "VIRTUAL_NET_METERING",
        "TGERC Regulation No. 1 of 2025 - Clause on RWA/GHS Shared Arrays",
        100.0, "ANNUAL", 2.57, json.dumps({"description": "Pro-rata allocation of generation among participating residential/common meters"}), 1
    ))

    # 4. Seed MNRE Sourced Benchmark Capital Costs
    cursor.execute("SELECT COUNT(*) as cnt FROM benchmark_costs")
    if cursor.fetchone()["cnt"] == 0:
        logger.info("Seeding MNRE dated benchmark rooftop capital costs...")
        benchmarks = [
            (0.5, 2.0, 62000.0, "MNRE Empaneled Benchmark FY24-25", "2024-2025"),
            (2.1, 3.0, 55000.0, "MNRE Empaneled Benchmark FY24-25", "2024-2025"),
            (3.1, 5.0, 51000.0, "MNRE Empaneled Benchmark FY24-25", "2024-2025"),
            (5.1, 10.0, 47000.0, "MNRE Empaneled Benchmark FY24-25", "2024-2025"),
            (10.1, 500.0, 43000.0, "MNRE Empaneled Benchmark FY24-25", "2024-2025")
        ]
        cursor.executemany("""
            INSERT INTO benchmark_costs (
                capacity_min_kw, capacity_max_kw, benchmark_cost_per_kw, source_order, effective_year
            ) VALUES (?, ?, ?, ?, ?)
        """, benchmarks)

    conn.commit()

def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
