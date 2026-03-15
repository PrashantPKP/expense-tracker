# Expense Tracker

A personal finance web app built with **React** and **Firebase**. Log daily expenses, organize them by category, and instantly see where your money is going through interactive charts — all synced to the cloud in real time.

---

## Live Demo

**Live App:** https://expense.zapsas.info

**Repository:** https://github.com/PrashantPKP/expense-tracker

---

## License Summary

- Personal, educational, and evaluation use is allowed.
- Commercial use is not allowed without written permission from the developers.
- Redistribution (original or modified) is not allowed without written permission.
- Credit and ownership remain with the original developers.

See [LICENCE](LICENCE) for complete legal terms.

---

## What This App Does

Expense Tracker helps you take control of your daily spending without any complexity. You sign in once, and from that point, every expense you log is saved to your personal cloud database and accessible from any device — phone, laptop, or tablet.

The app is split into two focused views:

- **Expenses view** — a clean table of all your entries with add, edit, and delete actions
- **Analytics view** — three charts (pie, bar, line) that break down your spending by category, month, and week

You never lose data. Everything is stored in Firebase Firestore and updates in real time across all your devices.

---

## Features

### Secure Authentication
- Sign in or create an account with **Email & Password**
- One-click **Sign in with Google**
- **Account linking** — if you sign up with email and later use Google (or vice versa) on the same email address, the app automatically connects them into one account
- **Forgot password** — reset link sent directly to your email
- Each user's data is completely private and isolated — no one else can see your expenses

### Expense Management
- **Add** a new expense with: date, amount (in Rs.), category, and a short note explaining what it was for
- **Edit** any past entry at any time
- **Delete** entries with a confirmation step to prevent accidents
- Expenses are always displayed **sorted by newest date first**
- All changes sync live — no refresh needed
- Notes are sanitized automatically to prevent XSS security issues

### Expense Form Fields

| Field | Details |
|---|---|
| Date | Defaults to today, fully editable |
| Amount | In Indian Rupees, whole numbers only |
| Category | Dropdown with 9 preset categories |
| What for | Short text note, up to 300 characters |

### Categories

`Food` `Transport` `Shopping` `Entertainment` `Subscription` `Groceries` `Health` `Education` `Other`

### Dashboard Stats (shown after sign-in)

| Stat | Description |
|---|---|
| Total Spent | Sum of all expenses ever logged |
| This Month | Total spending in the current calendar month |
| Highest Month | The month you spent the most, with the amount |
| Latest Expense | Category and amount of your most recent entry |

### Analytics Charts
- **Pie Chart** — visual breakdown of spending per category across all time
- **Bar Chart** — monthly total spending side by side to compare months
- **Line Chart** — week-by-week spending trend to spot short-term spikes
- **Quick Insight card** — highlights your single highest spending month automatically

### Data Export
- Click **Export Data** to open the export panel
- Select a **start date** and **end date**
- Downloads a `.json` file containing all matching expense entries, total count, your email, and the export timestamp
- Useful for backups or importing data into spreadsheets

---

## Who Can Use This

- **Individuals** tracking personal daily spending
- **Students** managing a monthly budget
- **Freelancers** keeping records of business-related costs
- **Anyone** who wants a simple, private, cloud-synced expense log without a subscription

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19 |
| Build Tool | Vite 7 |
| Styling | Custom CSS |
| Charts | Recharts |
| Authentication | Firebase Auth (Email/Password + Google OAuth) |
| Database | Cloud Firestore (real-time listener) |
| Input Security | DOMPurify (XSS sanitization) |
| Hosting | Any static host (Vercel, Netlify, Firebase Hosting) |

---


## Getting Started (Local Setup)

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A [Firebase](https://firebase.google.com/) project (free Spark plan is enough)

### 1. Clone the repository

```bash
git clone https://github.com/PrashantPKP/expense-tracker.git
cd expense-tracker
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project
2. Navigate to **Authentication** -> **Sign-in method** and enable **Email/Password** and **Google**
3. Navigate to **Firestore Database** -> create a database (start in test mode)
4. Go to **Project Settings** -> **Your apps** -> click **Add app** -> choose **Web**
5. Copy the `firebaseConfig` values shown

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and paste in your Firebase values:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
VITE_FIREBASE_PROJECT_ID=your_project_id_here
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id_here
```

> **Important:** Never commit your `.env` file. It is already excluded in `.gitignore`.

### 5. Start the development server

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 6. Build for production

```bash
npm run build
```

The output goes into the `dist/` folder — deploy it to any static hosting service.

---

## Firestore Security Rules

Once your app is working, replace the default Firestore rules with these to ensure **each user can only access their own data**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Apply these in **Firebase Console -> Firestore Database -> Rules**.

---

## Data Structure (Firestore)

Each expense is stored at the path: `users/{userId}/expenses/{expenseId}`

| Field | Type | Description |
|---|---|---|
| `date` | string | Date in `YYYY-MM-DD` format |
| `amount` | number | Amount in Indian Rupees |
| `category` | string | One of the 9 preset categories |
| `note` | string | Short description of the expense (max 300 chars) |
| `createdAt` | timestamp | Server timestamp when added |
| `updatedAt` | timestamp | Server timestamp on last edit |

---

## Developers

| Developer | GitHub | LinkedIn |
|---|---|---|
| Prashant Parshuramkar | [@PrashantPKP](https://github.com/PrashantPKP) | [prashantpkp](https://www.linkedin.com/in/prashantpkp/) |
| Himanshu Bele | [@HimanshuBele](https://github.com/HimanshuBele) | [himanshu-bele-597b24269](https://www.linkedin.com/in/himanshu-bele-597b24269/) |

---

## License

This project is provided under a restricted license for personal and evaluation use.
See [LICENCE](LICENCE) for full terms.
