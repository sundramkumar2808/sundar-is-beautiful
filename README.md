# Hostel Allocation System

A Flask-based hostel room and bed allocation application that demonstrates duplicate-allocation prevention using Python threading mutex locks.

## Features

- Allocate beds to students
- Maintain hostel block, room, and bed hierarchy
- View real-time occupancy statistics
- Simulate race conditions and mutex protection
- Admin panel for student management and exports
- CSV/JSON bulk import support

## Project Structure

- `app.py` – Flask application and API endpoints
- `templates/index.html` – Frontend dashboard and UI
- `static/css/style.css` – Styling
- `static/js/main.js` – Frontend logic
- `static/samples/` – Sample CSV/JSON data files
- `requirements.txt` – Python dependency list

## Prerequisites

- Python 3.13 or newer recommended
- Windows, macOS, or Linux

## Setup

1. Open a terminal in the project folder (or open the folder in VS Code):

   ```bash
   cd hostel-allocation
   ```

2. Create a virtual environment:

   ```bash
   python -m venv .venv
   ```

3. Activate the virtual environment:

   Windows PowerShell:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

   Windows Command Prompt:

   ```cmd
   .venv\Scripts\activate.bat
   ```

   macOS / Linux:

   ```bash
   source .venv/bin/activate
   ```

4. Install dependencies:

   ```bash
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   ```

## Run the Application

Start the Flask server:

```bash
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

## Default Login Demo Accounts

- Admin:
  - Email: `admin@hostel.edu`
  - Password: `admin`

- Student:
  - Email: `sundram@hostel.edu`
  - Password: `password123`

## Notes

- This project is designed as a demo and uses in-memory data storage.
- The app uses a threading mutex (`threading.Lock()`) to protect critical allocation logic and prevent duplicate bed assignments.
- For production use, replace the in-memory store with a real database and add secure authentication.

## Troubleshooting

If the app does not start:

- ensure the virtual environment is activated
- confirm Python 3.13+ is installed
- reinstall requirements with:

```bash
python -m pip install -r requirements.txt
```

If you still see issues, run:

```bash
python -m py_compile app.py
```
