import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth, db, googleProvider } from './firebase';
import logo from './assets/logo.png';

const categoryOptions = [
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Subscription',
  'Groceries',
  'Health',
  'Education',
  'Other',
];

const chartColors = ['#1c7c54', '#f4a259', '#8cb369', '#bc4b51'];
const MAX_NOTE_LENGTH = 300;

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const monthLabelFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: 'numeric',
});

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

const getToday = () => formatDateInput(new Date());

function parseExpenseDate(dateValue) {
  const [year, month, day] = String(dateValue).split('-').map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeExpense(expense, index) {
  const amount = Number(expense?.amount);

  return {
    id: expense?.id ?? Date.now() + index,
    date: typeof expense?.date === 'string' ? expense.date : getToday(),
    amount: Number.isFinite(amount) ? amount : 0,
    category: typeof expense?.category === 'string' && expense.category ? expense.category : categoryOptions[0],
    note: sanitizePlainText(expense?.note),
  };
}

function sanitizePlainText(value) {
  return DOMPurify.sanitize(String(value || ''), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTE_LENGTH);
}

function getExpenseCollection(userId) {
  return collection(db, 'users', userId, 'expenses');
}

function formatCurrency(value) {
  return currencyFormatter.format(value || 0);
}

function getWeekMeta(dateValue) {
  const date = parseExpenseDate(dateValue);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(date);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startLabel = `${weekStart.getDate()} ${weekStart.toLocaleString('en-IN', { month: 'short' })}`;
  const endLabel = `${weekEnd.getDate()} ${weekEnd.toLocaleString('en-IN', { month: 'short' })}`;

  return {
    startTime: weekStart.getTime(),
    label: `${startLabel} - ${endLabel}`,
  };
}

function buildMonthData(expenses) {
  const monthMap = new Map();

  expenses.forEach((expense) => {
    const date = parseExpenseDate(expense.date);
    const key = getMonthKey(date);
    const current = monthMap.get(key) || {
      month: monthLabelFormatter.format(date),
      total: 0,
    };

    current.total += expense.amount;
    monthMap.set(key, current);
  });

  return [...monthMap.entries()]
    .sort((first, second) => first[0].localeCompare(second[0]))
    .map((entry) => entry[1]);
}

function buildWeeklyData(expenses) {
  const weekMap = new Map();

  expenses.forEach((expense) => {
    const weekMeta = getWeekMeta(expense.date);
    const current = weekMap.get(weekMeta.startTime) || {
      week: weekMeta.label,
      startTime: weekMeta.startTime,
      total: 0,
    };

    current.total += expense.amount;
    weekMap.set(weekMeta.startTime, current);
  });

  return [...weekMap.values()]
    .sort((first, second) => first.startTime - second.startTime)
    .slice(-8)
    .map(({ week, total }) => ({ week, total }));
}

function buildCategoryData(expenses) {
  const categoryMap = new Map();

  expenses.forEach((expense) => {
    categoryMap.set(expense.category, (categoryMap.get(expense.category) || 0) + expense.amount);
  });

  return [...categoryMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((first, second) => second.value - first.value);
}

function buildMonthComparison(expenses) {
  const totals = buildMonthData(expenses);
  const highest = totals.reduce(
    (max, current) => (current.total > max.total ? current : max),
    { month: 'N/A', total: 0 },
  );

  return highest;
}

function getCurrentMonthTotal(expenses) {
  const currentMonthKey = getMonthKey(new Date());

  return expenses.reduce((total, expense) => {
    const expenseDate = parseExpenseDate(expense.date);

    if (getMonthKey(expenseDate) !== currentMonthKey) {
      return total;
    }

    return total + expense.amount;
  }, 0);
}

function getGoogleAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/unauthorized-domain':
      return 'Google sign-in is not available on this page right now. Please try again later or use email sign-in.';
    case 'auth/popup-blocked':
      return 'Google popup was blocked by the browser. Allow popups for this site and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google popup was closed before sign-in completed.';
    case 'auth/cancelled-popup-request':
      return 'Another Google sign-in popup is already open. Close it and try again.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is currently unavailable. Please use email sign-in for now.';
    case 'auth/network-request-failed':
      return 'Network error during Google sign-in. Check your internet connection and try again.';
    default:
      return 'Google sign-in could not be completed. Please try again.';
  }
}

function App() {
  const [activeView, setActiveView] = useState('expenses');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isDeletingExpenseId, setIsDeletingExpenseId] = useState(null);
  const [formError, setFormError] = useState('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [dataError, setDataError] = useState('');
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);
  const [pendingPasswordCredential, setPendingPasswordCredential] = useState(null);
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [expenses, setExpenses] = useState([]);

  const [formData, setFormData] = useState({
    date: getToday(),
    amount: '',
    category: categoryOptions[0],
    note: '',
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setExpenses([]);
      setDataError('');
      setIsDataLoading(false);
      closeModal();
      return undefined;
    }

    setIsDataLoading(true);
    setDataError('');

    const unsubscribe = onSnapshot(
      getExpenseCollection(user.uid),
      (snapshot) => {
        const nextExpenses = snapshot.docs.map((entry, index) => normalizeExpense({ id: entry.id, ...entry.data() }, index));
        setExpenses(nextExpenses);
        setIsDataLoading(false);
      },
      () => {
        setDataError('We could not load your expenses right now. Please refresh and try again.');
        setIsDataLoading(false);
      },
    );

    return unsubscribe;
  }, [user]);

  const sortedExpenses = useMemo(
    () => [...expenses].sort((first, second) => parseExpenseDate(second.date) - parseExpenseDate(first.date)),
    [expenses],
  );

  const monthData = useMemo(() => buildMonthData(sortedExpenses), [sortedExpenses]);
  const weeklyData = useMemo(() => buildWeeklyData(sortedExpenses), [sortedExpenses]);
  const categoryData = useMemo(() => buildCategoryData(sortedExpenses), [sortedExpenses]);
  const topMonth = useMemo(() => buildMonthComparison(sortedExpenses), [sortedExpenses]);

  const totalSpent = sortedExpenses.reduce((total, expense) => total + expense.amount, 0);
  const currentMonthTotal = getCurrentMonthTotal(sortedExpenses);
  const latestExpense = sortedExpenses[0];
  const isEditing = editingExpenseId !== null;
  const exportMinDate = sortedExpenses.length
    ? sortedExpenses.reduce(
        (minDate, expense) => (expense.date < minDate ? expense.date : minDate),
        sortedExpenses[0].date,
      )
    : '';
  const exportMaxDate = sortedExpenses.length
    ? sortedExpenses.reduce(
        (maxDate, expense) => (expense.date > maxDate ? expense.date : maxDate),
        sortedExpenses[0].date,
      )
    : '';

  function resetForm() {
    setFormData({
      date: getToday(),
      amount: '',
      category: categoryOptions[0],
      note: '',
    });
    setFormError('');
  }

  function resetAuthForm() {
    setAuthForm({
      email: '',
      password: '',
      confirmPassword: '',
    });
    setAuthError('');
    setAuthMessage('');
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingExpenseId(null);
    resetForm();
  }

  function openCreateModal() {
    setEditingExpenseId(null);
    resetForm();
    setIsModalOpen(true);
  }

  function openEditModal(expense) {
    setEditingExpenseId(expense.id);
    setFormError('');
    setFormData({
      date: expense.date,
      amount: String(expense.amount),
      category: expense.category,
      note: expense.note,
    });
    setIsModalOpen(true);
  }

  function handleInputChange(event) {
    const { name, value } = event.target;
    if (formError) {
      setFormError('');
    }

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleAuthInputChange(event) {
    const { name, value } = event.target;

    if (authError) {
      setAuthError('');
    }
    if (authMessage) {
      setAuthMessage('');
    }

    setAuthForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user) {
      setFormError('Sign in first to save expenses.');
      return;
    }

    const amount = Number(formData.amount);

    const sanitizedNote = sanitizePlainText(formData.note);

    if (!formData.date || !amount || amount < 1 || !sanitizedNote) {
      setFormError('Enter a valid date, amount, and purpose before saving.');
      return;
    }

    const expensePayload = {
      date: formData.date,
      amount,
      category: formData.category,
      note: sanitizedNote,
      updatedAt: serverTimestamp(),
    };

    setIsSavingExpense(true);

    try {
      if (editingExpenseId === null) {
        await addDoc(getExpenseCollection(user.uid), {
          ...expensePayload,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'users', user.uid, 'expenses', editingExpenseId), expensePayload);
      }

      closeModal();
    } catch {
      setFormError('We could not save this expense right now. Please try again.');
    } finally {
      setIsSavingExpense(false);
    }
  }

  async function handleDelete(expenseId) {
    if (!user) {
      return;
    }

    const confirmed = window.confirm('Delete this expense entry?');

    if (!confirmed) {
      return;
    }

    setIsDeletingExpenseId(expenseId);

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', expenseId));
    } catch {
      setDataError('We could not delete this expense right now. Please try again.');
    } finally {
      setIsDeletingExpenseId(null);
    }

    if (editingExpenseId === expenseId) {
      closeModal();
    }
  }

  async function handleGoogleSignIn() {
    setAuthError('');
    setAuthMessage('');
    setIsAuthSubmitting(true);

    try {
      const credential = await signInWithPopup(auth, googleProvider);

      if (pendingPasswordCredential) {
        await linkWithCredential(credential.user, pendingPasswordCredential);
        setPendingPasswordCredential(null);
        setAuthMessage('Email/password sign-in is now connected to this same Google account.');
      }
    } catch (error) {
      const googleCredential = GoogleAuthProvider.credentialFromError(error);
      const email = error?.customData?.email;

      if (error?.code === 'auth/account-exists-with-different-credential' && email && googleCredential) {
        const methods = await fetchSignInMethodsForEmail(auth, email);

        if (methods.includes('password')) {
          setPendingGoogleCredential(googleCredential);
          setAuthMode('signin');
          setAuthForm((current) => ({
            ...current,
            email,
          }));
          setAuthMessage('This email already exists with password login. Sign in with password once to connect Google to the same account.');
        } else {
          setAuthError('This email already exists with another sign-in method. Use that method first.');
        }
      } else {
        setAuthError(getGoogleAuthErrorMessage(error));
      }
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleEmailAuthSubmit(event) {
    event.preventDefault();

    if (!authForm.email || !authForm.password) {
      setAuthError('Enter email and password.');
      return;
    }

    if (authMode === 'signup' && !authForm.confirmPassword) {
      setAuthError('Confirm your password to create the account.');
      return;
    }

    if (authMode === 'signup' && authForm.password !== authForm.confirmPassword) {
      setAuthError('Password and confirm password must match.');
      return;
    }

    setAuthError('');
    setAuthMessage('');
    setIsAuthSubmitting(true);

    try {
      if (authMode === 'signin') {
        const credential = await signInWithEmailAndPassword(auth, authForm.email, authForm.password);

        if (pendingGoogleCredential) {
          await linkWithCredential(credential.user, pendingGoogleCredential);
          setPendingGoogleCredential(null);
          setAuthMessage('Google sign-in is now connected to this same account.');
        }
      } else {
        await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        setAuthMessage('Account created successfully. You can now use this email to sign in.');
      }

      if (authMode === 'signin') {
        resetAuthForm();
      }
    } catch (error) {
      if (authMode === 'signin') {
        if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
          setAuthError('Wrong password for this email.');
        } else if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-login-credentials') {
          setAuthError('No account found for this email. Use Create account first.');
          setAuthMode('signup');
        } else {
          setAuthError('Sign-in failed. Please check your email and password, then try again.');
        }
      } else if (error?.code === 'auth/email-already-in-use') {
        const methods = await fetchSignInMethodsForEmail(auth, authForm.email);

        if (methods.includes('google.com') && !methods.includes('password')) {
          setPendingPasswordCredential(EmailAuthProvider.credential(authForm.email, authForm.password));
          setAuthError('');
          setAuthMessage('This email already exists with Google. Click Continue with Google now to connect this password to the same account.');
        } else {
          setAuthError('This email already has an account. Use Sign in instead.');
          setAuthMode('signin');
        }
      } else if (error?.code === 'auth/weak-password') {
        setAuthError('Password is too weak. Use at least 6 characters.');
      } else {
        setAuthError('Account creation failed. Please try again in a moment.');
      }
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    if (!authForm.email) {
      setAuthError('Enter your email first, then use reset password.');
      return;
    }

    setAuthError('');
    setAuthMessage('');
    setIsAuthSubmitting(true);

    try {
      await sendPasswordResetEmail(auth, authForm.email);
      setAuthMessage('Password reset email sent. Check your inbox.');
    } catch {
      setAuthError('We could not send the reset email right now. Please try again.');
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      resetAuthForm();
      setIsExportModalOpen(false);
      setExportStartDate('');
      setExportEndDate('');
      setExportError('');
      setExportMessage('');
    } catch {
      setDataError('We could not sign you out right now. Please try again.');
    }
  }

  function openExportModal() {
    setIsExportModalOpen(true);
    setExportError('');
    setExportMessage('');
  }

  function closeExportModal() {
    setIsExportModalOpen(false);
  }

  function handleExportRangeSubmit(event) {
    event.preventDefault();

    setExportError('');
    setExportMessage('');

    if (!sortedExpenses.length) {
      setExportError('No expenses available to export.');
      return;
    }

    if (!exportStartDate || !exportEndDate) {
      setExportError('Select both start date and end date for export.');
      return;
    }

    if (exportStartDate > exportEndDate) {
      setExportError('Start date cannot be after end date.');
      return;
    }

    const filteredExpenses = sortedExpenses.filter((expense) => {
      return expense.date >= exportStartDate && expense.date <= exportEndDate;
    });

    if (!filteredExpenses.length) {
      setExportError('No expense entries found in the selected date range.');
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      userEmail: user?.email || null,
      range: {
        startDate: exportStartDate,
        endDate: exportEndDate,
      },
      totalRecords: filteredExpenses.length,
      expenses: filteredExpenses,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `expenses-${exportStartDate}-to-${exportEndDate}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    setExportMessage(`Exported ${filteredExpenses.length} expense entries.`);
  }

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-left" />
      <div className="bg-orb bg-orb-right" />

      <header className="hero">
        <div>
          <div className="hero-brand">
            <img src={logo} alt="Expense Tracker logo" className="hero-logo" />
            <p className="eyebrow">{user ? 'Expense Dashboard' : 'Frontend Expense Tracker'}</p>
          </div>
          <h1>
            {user
              ? 'Your money story is now live with synced entries and instant insights.'
              : 'Track spending simply, then switch to analytics when you need patterns.'}
          </h1>
          <p className="hero-copy">
            {user
              ? 'Add, edit, and review expenses from any device. Analytics helps you spot category trends, monthly highs, and weekly spending shifts at a glance.'
              : 'The main page stays focused on entries. Analytics separates category charts, monthly spending, and weekly analysis.'}
          </p>
        </div>

        {isAuthLoading ? (
          <div className="auth-card auth-status-card">
            <p className="section-label">Firebase</p>
            <h2>Checking sign-in status...</h2>
            <p className="section-note">Please wait while the app connects to your account.</p>
          </div>
        ) : user ? (
          <div className="stats-grid">
            <article className="stat-card stat-card-account">
              <span>Signed in as</span>
              <strong>{user.email || 'Google user'}</strong>
              <button type="button" className="mini-button" onClick={handleSignOut}>
                Sign out
              </button>
            </article>
            <article className="stat-card">
              <span>Total spent</span>
              <strong>{formatCurrency(totalSpent)}</strong>
            </article>
            <article className="stat-card">
              <span>This month</span>
              <strong>{formatCurrency(currentMonthTotal)}</strong>
            </article>
            <article className="stat-card">
              <span>Highest month</span>
              <strong>{topMonth.month}</strong>
              <small>{formatCurrency(topMonth.total)}</small>
            </article>
            <article className="stat-card">
              <span>Latest expense</span>
              <strong>{latestExpense ? latestExpense.category : 'No data'}</strong>
              <small>{latestExpense ? formatCurrency(latestExpense.amount) : 'Add one'}</small>
            </article>
          </div>
        ) : (
          <div className="auth-card">
            <p className="section-label">Firebase sign in</p>
            <h2>{authMode === 'signin' ? 'Sign in to your expenses' : 'Create your account'}</h2>
            <div className="auth-mode-switcher" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={authMode === 'signin' ? 'auth-mode-button active' : 'auth-mode-button'}
                onClick={() => {
                  setAuthMode('signin');
                  setAuthError('');
                  setAuthMessage('');
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={authMode === 'signup' ? 'auth-mode-button active' : 'auth-mode-button'}
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError('');
                  setAuthMessage('');
                }}
              >
                Create account
              </button>
            </div>
            <form className="auth-form" onSubmit={handleEmailAuthSubmit}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  placeholder="Enter email"
                  value={authForm.email}
                  onChange={handleAuthInputChange}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  name="password"
                  placeholder="Enter password"
                  value={authForm.password}
                  onChange={handleAuthInputChange}
                />
              </label>
              {authMode === 'signup' ? (
                <label>
                  <span>Confirm password</span>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm password"
                    value={authForm.confirmPassword}
                    onChange={handleAuthInputChange}
                  />
                </label>
              ) : null}
              {authError ? <p className="form-error">{authError}</p> : null}
              {authMessage ? <p className="form-success">{authMessage}</p> : null}
              <button type="submit" className="submit-button auth-submit" disabled={isAuthSubmitting}>
                {isAuthSubmitting ? 'Please wait...' : authMode === 'signin' ? 'Sign in with email' : 'Create account'}
              </button>
            </form>
            <button type="button" className="ghost-button auth-google" onClick={handleGoogleSignIn} disabled={isAuthSubmitting}>
              Continue with Google
            </button>
            {authMode === 'signin' ? (
              <button type="button" className="text-button auth-reset" onClick={handlePasswordReset}>
                Reset password
              </button>
            ) : null}
            <p className="section-note auth-helper-copy">
              Same email can be used as one account. If a Google popup says the email already exists,
              sign in once with password to connect Google to that same account.
            </p>
          </div>
        )}
      </header>

      {isAuthLoading ? null : user ? (
        <>
          <nav className="tab-bar" aria-label="View selector">
            <button
              type="button"
              className={activeView === 'expenses' ? 'tab active' : 'tab'}
              onClick={() => setActiveView('expenses')}
            >
              Expenses
            </button>
            <button
              type="button"
              className={activeView === 'analytics' ? 'tab active' : 'tab'}
              onClick={() => setActiveView('analytics')}
            >
              Analytics
            </button>
          </nav>

          {activeView === 'expenses' ? (
        <main className="content-card">
          <div className="section-header">
            <div>
              <p className="section-label">Expense list</p>
              <h2>Daily entries in table format</h2>
            </div>
            <div className="section-actions">
              <p className="section-note">All changes are saved in your Firebase account and sync across devices.</p>
              <button type="button" className="table-action" onClick={openExportModal}>
                Export Data
              </button>
            </div>
          </div>

          <div className="table-wrap">
            {dataError ? (
              <div className="empty-state">
                <h3>Firebase data error</h3>
                <p>{dataError}</p>
              </div>
            ) : isDataLoading ? (
              <div className="empty-state">
                <h3>Loading expenses...</h3>
                <p>Reading your data from Firestore.</p>
              </div>
            ) : sortedExpenses.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Category</th>
                    <th>What for</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{parseExpenseDate(expense.date).toLocaleDateString('en-IN')}</td>
                      <td>{formatCurrency(expense.amount)}</td>
                      <td>
                        <span className="badge">{expense.category}</span>
                      </td>
                      <td>{expense.note}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => openEditModal(expense)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="table-action table-action-danger"
                            disabled={isDeletingExpenseId === expense.id}
                            onClick={() => handleDelete(expense.id)}
                          >
                            {isDeletingExpenseId === expense.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <h3>No expenses yet</h3>
                <p>Add your first entry with the plus button to start tracking.</p>
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="analytics-grid">
          <section className="content-card chart-card">
            <div className="section-header">
              <div>
                <p className="section-label">Category split</p>
                <h2>Where your money goes</h2>
              </div>
            </div>
            <div className="chart-box">
              {categoryData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={92}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state empty-state-compact">
                  <h3>No analytics yet</h3>
                  <p>Add expenses to generate category graphs.</p>
                </div>
              )}
            </div>
          </section>

          <section className="content-card chart-card">
            <div className="section-header">
              <div>
                <p className="section-label">Monthly graph</p>
                <h2>Which month had more spend</h2>
              </div>
            </div>
            <div className="chart-box">
              {monthData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `₹${value}`} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="total" fill="#1c7c54" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state empty-state-compact">
                  <h3>No monthly totals</h3>
                  <p>Monthly comparison appears after you save expense entries.</p>
                </div>
              )}
            </div>
          </section>

          <section className="content-card chart-card chart-card-wide">
            <div className="section-header">
              <div>
                <p className="section-label">Weekly analysis</p>
                <h2>See recent week-by-week changes</h2>
              </div>
              <p className="section-note">Useful for checking short-term spending spikes.</p>
            </div>
            <div className="chart-box">
              {weeklyData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="week" />
                    <YAxis tickFormatter={(value) => `₹${value}`} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Line type="monotone" dataKey="total" stroke="#bc4b51" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state empty-state-compact">
                  <h3>No weekly analysis</h3>
                  <p>Weekly trends will show here after entries are added.</p>
                </div>
              )}
            </div>
          </section>

          <section className="content-card insight-card">
            <p className="section-label">Quick insight</p>
            <h2>{topMonth.month} is your highest spending month.</h2>
            <p>
              Total spend in that month is <strong>{formatCurrency(topMonth.total)}</strong>. Use the
              table view to inspect entries and keep adding future categories later.
            </p>
          </section>
        </main>
      )}
        </>
      ) : (
        <main className="content-card auth-note-card">
          <p className="section-label">Sign in required</p>
          <h2>Use Google or email to open your shared expense data.</h2>
          <p className="section-note">
            After sign-in, expenses are read from Firestore path users/{'{uid}'}/expenses.
          </p>
        </main>
      )}

      {user ? (
        <button
          type="button"
          className="fab"
          aria-label="Add expense"
          onClick={openCreateModal}
        >
          +
        </button>
      ) : null}

      {isModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-header modal-header">
              <div>
                <p className="section-label">{isEditing ? 'Edit expense' : 'New expense'}</p>
                <h2>{isEditing ? 'Update amount, category, date, and purpose' : 'Add amount, category, date, and what for'}</h2>
              </div>
              <button type="button" className="ghost-button" onClick={closeModal}>
                Close
              </button>
            </div>

            <form className="expense-form" onSubmit={handleSubmit}>
              <label>
                <span>Date</span>
                <input type="date" name="date" value={formData.date} onChange={handleInputChange} required />
              </label>

              <label>
                <span>Amount in rupees</span>
                <input
                  type="number"
                  name="amount"
                  min="1"
                  step="1"
                  max="100000000"
                  placeholder="Enter amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  required
                />
              </label>

              <label>
                <span>Category</span>
                <select name="category" value={formData.category} onChange={handleInputChange}>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-span-2">
                <span>What for</span>
                <textarea
                  name="note"
                  rows="4"
                  placeholder="Type the reason for this expense"
                  maxLength={MAX_NOTE_LENGTH}
                  value={formData.note}
                  onChange={handleInputChange}
                  required
                />
              </label>

              {formError ? <p className="form-error">{formError}</p> : null}

              <button type="submit" className="submit-button">
                {isSavingExpense ? 'Saving...' : isEditing ? 'Update expense' : 'Save expense'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {isExportModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeExportModal}>
          <div className="modal-card export-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-header modal-header">
              <div>
                <p className="section-label">Export data</p>
                <h2>Download JSON by date range</h2>
              </div>
              <button type="button" className="ghost-button" onClick={closeExportModal}>
                Close
              </button>
            </div>

            <form className="export-panel" onSubmit={handleExportRangeSubmit}>
              <div className="export-grid">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={exportStartDate}
                    min={exportMinDate}
                    max={exportMaxDate || undefined}
                    onChange={(event) => {
                      setExportStartDate(event.target.value);
                      if (exportError) {
                        setExportError('');
                      }
                      if (exportMessage) {
                        setExportMessage('');
                      }
                    }}
                  />
                </label>
                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={exportEndDate}
                    min={exportMinDate}
                    max={exportMaxDate || undefined}
                    onChange={(event) => {
                      setExportEndDate(event.target.value);
                      if (exportError) {
                        setExportError('');
                      }
                      if (exportMessage) {
                        setExportMessage('');
                      }
                    }}
                  />
                </label>
                <button type="submit" className="table-action export-action-button">
                  Download JSON
                </button>
              </div>
              {exportError ? <p className="form-error">{exportError}</p> : null}
              {exportMessage ? <p className="form-success">{exportMessage}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;