import os
import pandas as pd


LOG_PATH = r"c:\Users\Admin\Downloads\upload_log_institutional_verification_20260309_091008.xlsx"
UPLOAD_PATH = r"c:\Users\Admin\Downloads\instverification.xlsx"


def inspect_file(path: str) -> None:
    print("\n" + "=" * 80)
    print("FILE:", path)
    print("EXISTS:", os.path.exists(path))
    if not os.path.exists(path):
        return

    xls = pd.ExcelFile(path)
    print("SHEETS:", xls.sheet_names)

    for sheet in xls.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet)
        print(f"\n--- SHEET: {sheet} ---")
        print("ROWS:", len(df))
        print("COLS:", list(df.columns))

        lower_cols = {str(c).strip().lower(): c for c in df.columns}
        is_log_file = "upload_log" in os.path.basename(path).lower() or "log" in str(sheet).lower()

        if is_log_file:
            status_col = next((lower_cols[k] for k in lower_cols if k in ["status", "result", "state"]), None)
            msg_col = next((lower_cols[k] for k in lower_cols if k in ["message", "error", "detail", "remark"]), None)

            if status_col is not None:
                fail_df = df[df[status_col].astype(str).str.lower().isin(["fail", "failed", "error", "false"])]
                print("FAILED ROWS BY STATUS:", len(fail_df))
                if len(fail_df):
                    print(fail_df.head(30).to_string(index=False))

            if msg_col is not None:
                hit = df[
                    df[msg_col].astype(str).str.contains(
                        "TypeError|unexpected keyword|InstLetterStudent|institute|main_course|sub_course",
                        case=False,
                        na=False,
                    )
                ]
                print("ROWS MATCHING TARGET ERROR TEXT:", len(hit))
                if len(hit):
                    print(hit.head(30).to_string(index=False))
        else:
            print(df.head(15).to_string(index=False))


def main() -> None:
    inspect_file(LOG_PATH)
    inspect_file(UPLOAD_PATH)


if __name__ == "__main__":
    main()
import os
import pandas as pd

log_path = r"c:\Users\Admin\Downloads\upload_log_institutional_verification_20260309_091008.xlsx"
upload_path = r"c:\Users\Admin\Downloads\instverification.xlsx"

for path in [log_path, upload_path]:
    print("\n" + "=" * 80)
    print("FILE:", path)
    print("EXISTS:", os.path.exists(path))
    if not os.path.exists(path):
        continue

    xls = pd.ExcelFile(path)
    print("SHEETS:", xls.sheet_names)

    for sheet in xls.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet)
        print(f"\n--- SHEET: {sheet} ---")
        print("ROWS:", len(df))
        print("COLS:", list(df.columns))

        lower_cols = {str(c).strip().lower(): c for c in df.columns}

        is_log_file = "upload_log" in os.path.basename(path).lower() or "log" in str(sheet).lower()

        if is_log_file:
            status_col = next((lower_cols[k] for k in lower_cols if k in ["status", "result", "state"]), None)
            msg_col = next((lower_cols[k] for k in lower_cols if k in ["message", "error", "detail", "remark"]), None)

            if status_col is not None:
                fail_df = df[df[status_col].astype(str).str.lower().isin(["fail", "failed", "error", "false"]) ]
                print("FAILED ROWS BY STATUS:", len(fail_df))
                if len(fail_df):
                    print(fail_df.head(30).to_string(index=False))

            if msg_col is not None:
                hit = df[df[msg_col].astype(str).str.contains(
                    "TypeError|unexpected keyword|InstLetterStudent|institute|main_course|sub_course",
                    case=False,
                    na=False,
                )]
                print("ROWS MATCHING TARGET ERROR TEXT:", len(hit))
                if len(hit):
                    print(hit.head(30).to_string(index=False))
        else:
            print(df.head(10).to_string(index=False))
