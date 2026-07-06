// Run 'npm install @google/generative-ai' in your terminal to enable live Gemini AI.
// Add REACT_APP_GEMINI_API_KEY=your_key_here to a .env file in the project root.
import React, { useState, useMemo } from 'react';
import MainLayout from './layouts/MainLayout';
import bflowLogo from './assets/bflow logo.png';
import { GoogleGenerativeAI as GoogleGenAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY;

const BFLOW_AI_SYSTEM_INSTRUCTION =
  'You are the embedded AI core of Bflow, an elite bookshop sales and inventory management system. Answer queries concisely using professional retail terminology.';

async function askBflowAI(userMessage, contextData) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const genAI = new GoogleGenAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: BFLOW_AI_SYSTEM_INSTRUCTION,
  });

  const prompt =
    'Use the following live Bflow context JSON to answer accurately. Currency values are in CFA (whole numbers).\n\n' +
    JSON.stringify(contextData, null, 2) +
    '\n\nUser question: ' +
    userMessage;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

export default function Bflow() {
  const [newBook, setNewBook] = useState({ title: '', quantity: 0, price: ''});
  const [currentUser, setCurrentUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('admin@bflow.com'); // ⭐ NEW: Changed default to admin
  const [loginPassword, setLoginPassword] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [sales, setSales] = useState([
    { id: 1, date: '2026-05-15', items: 3, total: 45.50, cashier: 'Alice M.' },
    { id: 2, date: '2026-05-15', items: 5, total: 78.25, cashier: 'Bob K.' },
    { id: 3, date: '2026-05-14', items: 2, total: 32.00, cashier: 'Alice M.' },
  ]);

  const [inventory, setInventory] = useState([
    { id: 1, title: 'Introduction to Python', author: 'Guido van Rossum', stock: 45, price: 25.99, reorderLevel: 20 },
    { id: 2, title: 'Data Science Fundamentals', author: 'Jane Smith', stock: 12, price: 34.50, reorderLevel: 25 },
    { id: 3, title: 'Web Development Guide', author: 'John Developer', stock: 67, price: 28.00, reorderLevel: 20 },
    { id: 4, title: 'Mathematics for Engineers', author: 'Prof. Algebra', stock: 18, price: 42.99, reorderLevel: 15 },
    { id: 5, title: 'Digital Marketing Basics', author: 'Sarah Online', stock: 8, price: 19.99, reorderLevel: 20 },
  ]);

  const BUNDLE_DISCOUNT_RATE = 0.05;

  const [cartItems, setCartItems] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatMessages, setAiChatMessages] = useState([
    { role: 'assistant', text: "Hello! Ask me anything about Bflow's financial data, agent performance, or inventory margins." },
  ]);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [supplierOrderGenerated, setSupplierOrderGenerated] = useState(false);

  const formatCFA = (amount) => Math.round(amount).toLocaleString() + ' CFA';

  // ⭐ NEW: USER ROLES WITH PERMISSIONS - Based on Access Matrix
  const users = {
    'admin@bflow.com': { 
      role: 'admin', 
      name: 'Admin User', 
      // ⭐ Admin has ALL permissions
      permissions: ['analytics', 'manage_books', 'view_records', 'manage_sales'] 
    },
    'storekeeper@bflow.com': { 
      role: 'storekeeper', 
      name: 'Store Keeper', 
      // ⭐ Storekeeper can only manage books and view records
      permissions: ['manage_books', 'view_records'] 
    },
    'salesagent@bflow.com': { 
      role: 'salesagent', 
      name: 'Sales Agent', 
      // ⭐ Sales Agent can only view records and manage sales
      permissions: ['view_records', 'manage_sales'] 
    },
  };

  // ⭐ NEW: Helper function to check if user has a specific permission
  const hasPermission = (permission) => {
    return currentUser?.permissions?.includes(permission) || false;
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (users[loginEmail]) {
      setCurrentUser({ email: loginEmail, ...users[loginEmail] });
      setLoginPassword('');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginEmail('admin@bflow.com');
    setLoginPassword('');
    setActiveTab('dashboard');
    setReceipt(null);
    setAiChatOpen(false);
    setAiChatLoading(false);
    setSupplierOrderGenerated(false);
  };

  const addToCart = (book) => {
    const existingItem = cartItems.find(item => item.id === book.id);
    if (existingItem) {
      if (existingItem.qty < book.stock) {
        setCartItems(cartItems.map(item =>
          item.id === book.id ? { ...item, qty: item.qty + 1 } : item
        ));
      }
    } else {
      setCartItems([...cartItems, { ...book, qty: 1 }]);
    }
  };

  const removeFromCart = (bookId) => {
    setCartItems(cartItems.filter(item => item.id !== bookId));
  };

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + Math.round(item.price * item.qty), 0);
  }, [cartItems]);

  const bundleRecommendation = useMemo(() => {
    if (cartItems.length === 0) return null;
    const cartIds = cartItems.map(item => item.id);
    const primaryItem = cartItems[0];
    const suggestedBook = inventory.find(
      book => book.id !== primaryItem.id && !cartIds.includes(book.id) && book.stock > 0
    );
    if (!suggestedBook) return null;
    return {
      primaryTitle: primaryItem.title,
      suggestedBook,
      bundlePrice: Math.round(suggestedBook.price * (1 - BUNDLE_DISCOUNT_RATE)),
    };
  }, [cartItems, inventory]);

  const generateContextualAiResponse = (query) => {
    const q = query.toLowerCase();

    if (q.includes('low stock') || q.includes('low in stock') || q.includes('reorder') || q.includes('running out') || q.includes('deplet')) {
      const lowStockBooks = inventory.filter(book => book.stock <= book.reorderLevel);
      if (lowStockBooks.length === 0) {
        return 'All titles are currently above reorder thresholds — no low-stock alerts at this time.';
      }
      const names = lowStockBooks.map(book => book.title + ' (' + book.stock + ' units)').join(', ');
      return 'Low-stock alert — ' + lowStockBooks.length + ' title(s) need attention: ' + names + '.';
    }

    if (q.includes('agent') || q.includes('cashier') || q.includes('revenue') || q.includes('performer') || q.includes('sold the most')) {
      const byCashier = sales.reduce((acc, sale) => {
        acc[sale.cashier] = (acc[sale.cashier] || 0) + sale.total;
        return acc;
      }, {});
      const topAgent = Object.entries(byCashier).sort((a, b) => b[1] - a[1])[0];
      return topAgent
        ? 'Top-performing agent: ' + topAgent[0] + ' with ' + formatCFA(topAgent[1]) + ' in recorded sales.'
        : 'No agent performance data is available yet.';
    }

    if (q.includes('inventory') || q.includes('margin') || q.includes('stock value') || q.includes('worth')) {
      const lowStock = inventory.filter(book => book.stock <= book.reorderLevel).length;
      const inventoryValue = inventory.reduce((sum, book) => sum + (book.stock * book.price), 0);
      return 'Inventory insight: ' + lowStock + ' title(s) at or below reorder level. Total stock value is ' + formatCFA(inventoryValue) + '.';
    }

    return null;
  };

  const handleAiChatSend = async (e) => {
    e.preventDefault();
    const trimmed = aiChatInput.trim();
    if (!trimmed || aiChatLoading) return;

    setAiChatMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setAiChatInput('');

    const contextualReply = generateContextualAiResponse(trimmed);
    if (contextualReply) {
      setAiChatMessages(prev => [...prev, { role: 'assistant', text: contextualReply }]);
      return;
    }

    if (!GEMINI_API_KEY) {
      const totalRevenue = Math.round(sales.reduce((sum, s) => sum + s.total, 0));
      setAiChatMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Gemini API key missing. Please configure your .env file to activate live intelligence. Meanwhile, Bflow snapshot: ' + formatCFA(totalRevenue) + ' across ' + sales.length + ' transactions.',
      }]);
      return;
    }

    const contextData = {
      inventory: inventory.map(book => ({
        title: book.title,
        author: book.author,
        stock: book.stock,
        priceCFA: Math.round(book.price),
        reorderLevel: book.reorderLevel,
        lowStock: book.stock <= book.reorderLevel,
      })),
      recentSales: sales.slice(0, 10).map(sale => ({
        date: sale.date,
        items: sale.items,
        totalCFA: Math.round(sale.total),
        cashier: sale.cashier,
      })),
      summary: {
        totalRevenueCFA: Math.round(sales.reduce((sum, s) => sum + s.total, 0)),
        totalTransactions: sales.length,
        avgTransactionCFA: sales.length > 0
          ? Math.round(sales.reduce((sum, s) => sum + s.total, 0) / sales.length)
          : 0,
      },
    };

    setAiChatLoading(true);
    try {
      const reply = await askBflowAI(trimmed, contextData);
      setAiChatMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (error) {
      const message = error?.message === 'GEMINI_API_KEY_MISSING'
        ? 'Gemini API key missing. Please configure your .env file to activate live intelligence.'
        : 'Unable to reach Bflow AI right now. Please verify your API key and try again.';
      setAiChatMessages(prev => [...prev, { role: 'assistant', text: message }]);
    } finally {
      setAiChatLoading(false);
    }
  };

  const addBundleToCart = () => {
    if (!bundleRecommendation) return;
    const book = bundleRecommendation.suggestedBook;
    const bundlePrice = bundleRecommendation.bundlePrice;

    setCartItems(prev => {
      const existingItem = prev.find(item => item.id === book.id);
      if (existingItem) {
        if (existingItem.qty >= book.stock) return prev;
        return prev.map(item =>
          item.id === book.id
            ? { ...item, qty: item.qty + 1, price: bundlePrice, bundleDiscount: true }
            : item
        );
      }
      return [...prev, { ...book, qty: 1, price: bundlePrice, bundleDiscount: true }];
    });
  };

  const handleGenerateSupplierOrder = () => {
    setSupplierOrderGenerated(true);
  };

  const processSale = () => {
    if (cartItems.length === 0) return;

    const receiptData = {
      timestamp: new Date(),
      items: cartItems.map(item => ({
        title: item.title,
        qty: item.qty,
        price: item.price,
        subtotal: item.price * item.qty,
      })),
      total: cartTotal,
      cashier: currentUser.name,
    };
    
    const newSale = {
      id: sales.length + 1,
      date: new Date().toISOString().split('T')[0],
      items: cartItems.length,
      total: Math.round(cartTotal),
      cashier: currentUser.name,
    };
    
    setSales([newSale, ...sales]);
    
    cartItems.forEach(cartItem => {
      setInventory(inventory.map(book =>
        book.id === cartItem.id ? { ...book, stock: book.stock - cartItem.qty } : book
      ));
    });
    
    setCartItems([]);
    setReceipt(receiptData);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const updateStock = (bookId, newStock) => {
    setInventory(inventory.map(book =>
      book.id === bookId ? { ...book, stock: Math.max(0, newStock) } : book
    ));
  };

  const report = {
    totalRevenue: sales.reduce((sum, s) => sum + s.total, 0),
    avgTransaction: sales.length > 0 ? sales.reduce((sum, s) => sum + s.total, 0) / sales.length : 0,
    totalTransactions: sales.length,
  };

  // ===== LOGIN PAGE =====
  if (!currentUser) {
    return (
    <MainLayout showSignOut={false}>
      {/* ✨ GLOBAL BRAND DESIGN REFINEMENTS & HOVER EFFECTS */}
     <style>{`
      /* Exquisite Dashboard Physics */
      .brand-card {
        background: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 12px !important;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05) !important;
        transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .brand-card:hover {
        transform: translateY(-4px);
        border-color: #D9A05B !important;
        box-shadow: 0 20px 25px -5px rgba(148, 163, 184, 0.15), 0 10px 10px -5px rgba(148, 163, 184, 0.05) !important;
      }
      .brand-btn {
        font-weight: 600 !important;
        letter-spacing: 0.02em !important;
        border-radius: 8px !important;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .brand-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(217, 160, 91, 0.25) !important;
        filter: brightness(1.05);
      }
      .table-row {
        transition: background-color 0.2s ease, transform 0.2s ease !important;
      }
      .table-row:hover {
        background-color: #F1F5F9 !important;
        cursor: pointer;
      }
      .premium-input {
        border: 1px solid #CBD5E1 !important;
        border-radius: 8px !important;
        padding: 10px 14px !important;
        transition: all 0.2s ease !important;
      }
      .premium-input:focus {
        outline: none !important;
        border-color: #D9A05B !important;
        box-shadow: 0 0 0 3px rgba(217, 160, 91, 0.15) !important;
      }
    `}</style>
        <div style={{
          background: 'radial-gradient(circle at 0% 0%, #1E293B 0%, #0F172A 100%)',
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          <div
            className="brand-card"
            style={{
              padding: '3rem 2rem',
              width: '100%',
              maxWidth: '420px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '14px',
                }}
              >
                <img
                  src={bflowLogo}
                  alt=""
                  style={{
                    height: '56px',
                    width: 'auto',
                    objectFit: 'contain',
                  }}
                />
                <span
                  style={{
                    fontSize: '36px',
                    fontWeight: '800',
                    color: '#0F6E56',
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                  }}
                >
                  Bflow
                </span>
              </div>
            </div>
            <p style={{ color: '#666', fontSize: '14px', margin: '0 0 1.5rem', textAlign: 'center' }}>
              Welcome! Please sign in to continue.
            </p>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  type="email"
                  className="premium-input"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={{
                    width: '100%',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '6px' }}>
                  Password
                </label>
                <input
                  type="password"
                  className="premium-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password (any value)"
                  style={{
                    width: '100%',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                type="submit"
                className="brand-btn"
                style={{
                  background: 'linear-gradient(135deg, #0F6E56, #185FA5)',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  fontSize: '15px',
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                  width: '100%',
                }}
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      </MainLayout>
    );
  }

  // ===== MAIN APP =====
  return (
    <MainLayout handleLogout={handleLogout} showSignOut contentPadding={0}>
      <style>{`
        /* Exquisite Dashboard Physics */
        .brand-card {
          background: #FFFFFF !important;
          border: 1px solid #E2E8F0 !important;
          border-radius: 12px !important;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05) !important;
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .brand-card:hover {
          transform: translateY(-4px);
          border-color: #D9A05B !important;
          box-shadow: 0 20px 25px -5px rgba(148, 163, 184, 0.15), 0 10px 10px -5px rgba(148, 163, 184, 0.05) !important;
        }
        .brand-btn {
          font-weight: 600 !important;
          letter-spacing: 0.02em !important;
          border-radius: 8px !important;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .brand-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(217, 160, 91, 0.25) !important;
          filter: brightness(1.05);
        }
        .table-row {
          transition: background-color 0.2s ease, transform 0.2s ease !important;
        }
        .table-row:hover {
          background-color: #F1F5F9 !important;
          cursor: pointer;
        }
        .premium-input {
          border: 1px solid #CBD5E1 !important;
          border-radius: 8px !important;
          padding: 10px 14px !important;
          transition: all 0.2s ease !important;
        }
        .premium-input:focus {
          outline: none !important;
          border-color: #D9A05B !important;
          box-shadow: 0 0 0 3px rgba(217, 160, 91, 0.15) !important;
        }
        .logout-btn {
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
          will-change: transform;
        }
        .logout-btn:hover {
          background-color: #2E4236 !important;
          transform: translateY(-1px);
        }
        .sales-history-table th {
          background: #1E293B !important;
          color: #CBD5E1 !important;
          font-weight: 700 !important;
          padding: 16px 18px !important;
          font-size: 12px !important;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .sales-history-row td {
          color: #F1F5F9 !important;
          padding: 16px 18px !important;
        }
        .sales-history-row:hover {
          background-color: rgba(30, 41, 59, 0.6) !important;
        }
        .ai-chat-fab {
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
          will-change: transform;
        }
        .ai-chat-fab:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(217, 160, 91, 0.35) !important;
        }
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
      <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#0F172A', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column' }}>
        {/* ⭐ NEW: Enhanced Header with Role Badges */}
        <div style={{
          background: 'linear-gradient(135deg, #5C4033 0%, #8A6B55 100%)',
          color: '#FFFFFF',
          width: '100vw',
          marginLeft: 'calc(50% - 50vw)',
          boxSizing: 'border-box',
          padding: '0.75rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        <div>
          {/* <h1 style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 0.5rem' }}>Bflow</h1> */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '13px' }}>
            <span>{currentUser.name}</span>
            <span style={{ opacity: 0.8 }}>•</span>
            <span style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {/* ⭐ NEW: Role badges with emojis */}
              {currentUser.role === 'admin' ? '🔐 Administrator' : currentUser.role === 'storekeeper' ? '📦 Store Keeper' : '💳 Sales Agent'}
            </span>
          </div>
        </div>
        </div>

      {/* Smart Tab Navigation — full-bleed across viewport */}
      <div style={{
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        boxSizing: 'border-box',
        backgroundColor: '#0F172A',
        display: 'flex',
        padding: '0 2rem',
        gap: '2rem',
        borderBottom: '1px solid #1E293B',
      }}>
        {['dashboard', 'records', 'sales', 'inventory', 'reports'].map(tab => {
          // ⭐ NEW: Control which tabs are visible based on permissions
          const tabPermissions = {
            'dashboard': true,
            'records': hasPermission('view_records'),
            'sales': hasPermission('manage_sales'),
            'inventory': hasPermission('manage_books'),
            'reports': hasPermission('analytics'),
          };

          if (!tabPermissions[tab]) return null;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '3px solid #0F6E56' : 'none',
                color: activeTab === tab ? '#F8FAFC' : '#94A3B8',
                padding: '0.5rem 0',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab ? '500' : '400',
              }}
            >
              {tab === 'records' ? 'Book Records' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, width: '100%', backgroundColor: '#0F172A', boxSizing: 'border-box' }}>
        {/* ⭐ NEW: Dashboard with Permission Card */}
        {activeTab === 'dashboard' && (
          <div style={{ backgroundColor: '#0F172A', padding: '24px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', margin: '0 0 2rem', color: '#F1F5F9' }}>
              Dashboard
            </h2>

            {hasPermission('analytics') && (
              <>
                {(() => {
                  const metrics = [
                    {
                      label: "Today's Revenue",
                      value: formatCFA(report?.totalRevenue || 0),
                      color: '#D9A05B',
                    },
                    {
                      label: 'Transactions',
                      value: report?.totalTransactions || 0,
                      color: '#5C4033',
                    },
                    {
                      label: 'Low Stock Items',
                      value: inventory?.filter(item => item.stock <= 5).length || 0,
                      color: '#BA7517',
                    },
                    {
                      label: 'Inventory Value',
                      value: formatCFA(inventory?.reduce((sum, item) => sum + (item.price * item.stock), 0) || 0),
                      color: '#D9A05B',
                    },
                  ];

                  return (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '20px',
                      marginBottom: '2rem',
                    }}>
                      {metrics.map((metric, idx) => (
                        <div
                          key={idx}
                          className="brand-card"
                          style={{
                            padding: '1.75rem',
                            borderLeft: '4px solid ' + metric.color,
                            cursor: 'pointer',
                          }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '600', color: '#64748B', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {metric.label}
                          </p>
                          <p style={{ fontSize: '32px', fontWeight: '700', margin: 0, color: '#1E293B', letterSpacing: '-0.02em' }}>
                            {metric.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div style={{
                  marginBottom: '2rem',
                  padding: '1.5rem',
                  background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  borderLeft: '4px solid #D9A05B',
                }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 1rem', color: '#F1F5F9' }}>
                    ✨ Bflow AI Proactive Insights
                  </h3>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    padding: '1rem 1.25rem',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid #475569',
                    borderRadius: '10px',
                  }}>
                    <p style={{ margin: 0, flex: '1 1 280px', fontSize: '14px', lineHeight: '1.6', color: '#CBD5E1' }}>
                      Based on sales velocity trends, accounting textbooks and seasonal novels are projected to deplete within 5 days due to high demand.
                    </p>
                    <button
                      className="brand-btn"
                      onClick={handleGenerateSupplierOrder}
                      style={{
                        backgroundColor: supplierOrderGenerated ? '#334155' : '#D9A05B',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '12px 20px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {supplierOrderGenerated ? 'Supplier Order Queued ✓' : 'Generate Automated Supplier Order'}
                    </button>
                  </div>
                </div>

                <div className="brand-card" style={{ padding: '2rem' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 1.5rem' }}>Recent Transactions</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ textAlign: 'left', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Date</th>
                        <th style={{ textAlign: 'left', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Cashier</th>
                        <th style={{ textAlign: 'left', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Items</th>
                        <th style={{ textAlign: 'right', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.slice(0, 5).map(sale => (
                        <tr key={sale.id} className="table-row" style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '16px', color: '#334155' }}>{sale.date}</td>
                          <td style={{ padding: '16px', color: '#334155' }}>{sale.cashier}</td>
                          <td style={{ padding: '16px', color: '#334155' }}>{sale.items}</td>
                          <td style={{ padding: '16px', textAlign: 'right', color: '#334155', fontWeight: '700' }}>{formatCFA(sale.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ⭐ NEW: Book Records Tab - Accessible to ALL users (Read-Only) */}
        {activeTab === 'records' && (
          <div style={{ backgroundColor: '#0F172A', padding: '24px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', margin: '0 0 2rem', color: '#F1F5F9' }}>
              Book Records
            </h2>
            <div className="brand-card" style={{ padding: '2rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ textAlign: 'left', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Title</th>
                    <th style={{ textAlign: 'left', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Author</th>
                    <th style={{ textAlign: 'center', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Price</th>
                    <th style={{ textAlign: 'center', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(book => (
                    <tr key={book.id} className="table-row" style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px', fontWeight: '500', color: '#333' }}>{book.title}</td>
                      <td style={{ padding: '12px', color: '#666' }}>{book.author}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#0F6E56', fontWeight: '500' }}>{formatCFA(book.price)}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#333' }}>{book.stock} copies</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ⭐ NEW: Sales Tab - Only accessible to Admin & Sales Agent */}
        {activeTab === 'sales' && (
          <div style={{ backgroundColor: '#0F172A', padding: '24px' }}>
            {!hasPermission('manage_sales') ? (
              <div style={{
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '8px',
                padding: '3rem 2rem',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 0.5rem', color: '#721c24' }}>
                  🔒 Access Restricted
                </p>
                <p style={{ color: '#721c24', margin: 0 }}>
                  Sales are only available to Sales Agents and Administrators
                </p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#0F172A' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 1.5rem', color: '#F1F5F9' }}>Sales Module</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 1rem' }}>Available Books</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                      {inventory.map(book => (
                        <div key={book.id} className="brand-card" style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div>
                              <p style={{ fontSize: '14px', fontWeight: '500', margin: '0 0 2px', color: '#333' }}>{book.title}</p>
                              <p style={{ fontSize: '12px', margin: 0, color: '#999' }}>by {book.author}</p>
                            </div>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0F6E56', margin: 0 }}>{formatCFA(book.price)}</p>
                          </div>
                          <button
                            className="brand-btn"
                            onClick={() => addToCart(book)}
                            disabled={book.stock === 0}
                            style={{
                              width: '100%',
                              background: book.stock === 0 ? '#ccc' : '#0F6E56',
                              color: 'white',
                              border: 'none',
                              padding: '8px',
                              cursor: book.stock === 0 ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            {book.stock === 0 ? 'Out of Stock' : `Add to Cart (${book.stock} available)`}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 1rem', color: '#F1F5F9' }}>Shopping Cart</h3>

                    {cartItems.length > 0 && bundleRecommendation && (
                      <div style={{
                        marginBottom: '1rem',
                        padding: '1rem 1.25rem',
                        background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                        border: '1px solid #D9A05B',
                        borderRadius: '12px',
                      }}>
                        <p style={{ margin: '0 0 0.75rem', fontSize: '13px', fontWeight: '700', color: '#D9A05B', letterSpacing: '0.03em' }}>
                          💡 Smart AI Cross-Sell Recommendations
                        </p>
                        <p style={{ margin: '0 0 1rem', fontSize: '14px', lineHeight: '1.5', color: '#F1F5F9' }}>
                          Customers who bought this title frequently purchased <strong>{bundleRecommendation.suggestedBook.title}</strong>. Add it now for <strong>{formatCFA(bundleRecommendation.bundlePrice)}</strong> (5% bundle savings).
                        </p>
                        <button
                          className="brand-btn"
                          onClick={addBundleToCart}
                          style={{
                            backgroundColor: '#D9A05B',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '10px 18px',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                        >
                          + Add Bundle to Cart
                        </button>
                      </div>
                    )}

                    <div className="brand-card" style={{ padding: '1.5rem' }}>
                      {cartItems.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#999', margin: 0 }}>No items</p>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1rem', maxHeight: '250px', overflowY: 'auto' }}>
                            {cartItems.map(item => (
                              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                                <div>
                                  <p style={{ margin: '0 0 4px', fontWeight: '500', color: '#333' }}>
                                    {item.title}
                                    {item.bundleDiscount && (
                                      <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '600', color: '#D9A05B', textTransform: 'uppercase' }}>
                                        5% bundle
                                      </span>
                                    )}
                                  </p>
                                  <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>{formatCFA(item.price)} × {item.qty}</p>
                                </div>
                                <button
                                  onClick={() => removeFromCart(item.id)}
                                  style={{ background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer', fontSize: '18px' }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>

                          <div style={{ borderTop: '2px solid #ddd', paddingTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '600', color: '#0F6E56', marginBottom: '1rem' }}>
                              <span>Total:</span>
                              <span>{formatCFA(cartTotal)}</span>
                            </div>
                            <button
                              className="brand-btn"
                              onClick={processSale}
                              style={{
                                width: '100%',
                                background: '#0F6E56',
                                color: 'white',
                                border: 'none',
                                padding: '12px',
                                borderRadius: '6px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                fontSize: '14px',
                              }}
                            >
                              Process Sale ✓
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ⭐ NEW: Inventory Tab - Only accessible to Admin & Storekeeper */}
        {activeTab === 'inventory' && (
          <div style={{ backgroundColor: '#0F172A', padding: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 1.5rem', color: '#F1F5F9' }}>Inventory Management</h2>
        
        {currentUser.role === 'storekeeper' && (
          <div
            className="brand-card"
            style={{
              padding: '24px',
              marginBottom: '24px',
              borderTop: '4px solid #5C4033',
            }}
          >
            <h3 style={{ color: '#5C4033', margin: '0 0 16px 0', fontSize: '16px' }}>Add New Book Title</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              
              // 1. Create the new item object matching your table's properties
              const bookToAdd = {
                id: Date.now(), // Unique ID generation
                title: newBook.title,
                stock: parseInt(newBook.quantity) || 0, // matches your 'Stock' column variable name
                price: parseFloat(newBook.price) || 0   // matches your 'Price' column variable name
              };

              // 2. Append it to your existing list state (Change 'setBooks' and 'books' to match your array state name)
              setInventory([...inventory, bookToAdd]);

              // 3. Clear out the form text boxes immediately
              setNewBook({ title: '', quantity: 0, price: '' });
              
            }} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              
              {/* Title Input */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 2, minWidth: '200px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Book Title</label>
                <input 
                  type="text" 
                  className="premium-input"
                  placeholder="e.g., Advanced Software Engineering"
                  value={newBook.title}
                  onChange={(e) => setNewBook({...newBook, title: e.target.value})}
                  style={{ fontSize: '14px', boxSizing: 'border-box', width: '100%' }}
                  required
                />
              </div>

              {/* Quantity Input */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '100px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Initial Stock</label>
                <input 
                  type="number" 
                  className="premium-input"
                  min="1"
                  value={newBook.quantity || ''}
                  onChange={(e) => setNewBook({...newBook, quantity: parseInt(e.target.value) || 0})}
                  style={{ fontSize: '14px', boxSizing: 'border-box', width: '100%' }}
                  required
                />
              </div>

              {/* 💰 NEW: Price Input Box */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '100px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Price (CFA)</label>
                <input 
                  type="number" 
                  className="premium-input"
                  step="any"
                  min="0"
                  placeholder="e.g., 5000"
                  value={newBook.price}
                  onChange={(e) => setNewBook({...newBook, price: e.target.value})}
                  style={{ fontSize: '14px', boxSizing: 'border-box', width: '100%' }}
                  required
                />
              </div>

              <button 
                type="submit"
                className="brand-btn"
                style={{
                  backgroundColor: '#D9A05B',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 24px',
                  cursor: 'pointer',
                }}
              >
                Save to Stock
              </button>
            </form>
          </div>
        )}
        
            {!hasPermission('manage_books') ? (
              <div style={{
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '8px',
                padding: '3rem 2rem',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 0.5rem', color: '#721c24' }}>
                  🔒 Access Restricted
                </p>
                <p style={{ color: '#721c24', margin: 0 }}>
                  Inventory management is only available to Store Keepers and Administrators
                </p>
              </div>
            ) : (
              <div className="brand-card" style={{ padding: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ textAlign: 'left', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Title</th>
                      <th style={{ textAlign: 'center', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Stock</th>
                      <th style={{ textAlign: 'right', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Price</th>
                      <th style={{ textAlign: 'center', background: '#F8FAFC', color: '#64748B', padding: '14px 16px', fontWeight: '600', fontSize: '12px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(book => (
                      <tr key={book.id} className="table-row" style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '16px', fontWeight: '500', color: '#334155' }}>{book.title}</td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <input
                            type="number"
                            className="premium-input"
                            value={book.stock}
                            onChange={(e) => updateStock(book.id, parseInt(e.target.value))}
                            style={{ width: '60px', textAlign: 'center', color: '#334155' }}
                          />
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right', color: '#334155', fontWeight: '700' }}>{formatCFA(book.price)}</td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <button
                            className="brand-btn"
                            onClick={() => updateStock(book.id, book.stock + 10)}
                            style={{
                              backgroundColor: '#D9A05B',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '12px 24px',
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            +10
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ⭐ NEW: Reports Tab - Only accessible to Admin */}
        {activeTab === 'reports' && (
          <div style={{ backgroundColor: '#0F172A', padding: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 2rem', color: '#F1F5F9' }}>Reports & Analytics</h2>
            {!hasPermission('analytics') ? (
              <div style={{
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '8px',
                padding: '3rem 2rem',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 0.5rem', color: '#721c24' }}>
                  🔒 Access Restricted
                </p>
                <p style={{ color: '#721c24', margin: 0 }}>
                  Reports are only available to Administrators
                </p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#0F172A' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Revenue', value: formatCFA(report.totalRevenue), color: '#0F6E56' },
                    { label: 'Avg Transaction', value: formatCFA(report.avgTransaction), color: '#185FA5' },
                    { label: 'Total Transactions', value: report.totalTransactions, color: '#BA7517' },
                  ].map((stat, idx) => (
                    <div
                      key={idx}
                      className="brand-card"
                      style={{ padding: '1.5rem', borderLeft: '4px solid ' + stat.color }}
                    >
                      <p style={{ fontSize: '12px', color: '#999', margin: '0 0 0.5rem' }}>{stat.label}</p>
                      <p style={{ fontSize: '28px', fontWeight: '600', margin: 0, color: stat.color }}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div style={{
                  padding: '2rem',
                  background: '#0F172A',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 1.5rem', color: '#F1F5F9' }}>Sales History</h3>
                  <table className="sales-history-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: '14px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Date</th>
                        <th style={{ textAlign: 'left' }}>Cashier</th>
                        <th style={{ textAlign: 'center' }}>Items</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map(sale => (
                        <tr key={sale.id} className="sales-history-row table-row">
                          <td>{sale.date}</td>
                          <td>{sale.cashier}</td>
                          <td style={{ textAlign: 'center' }}>{sale.items}</td>
                          <td style={{ textAlign: 'right', fontWeight: '700' }}>{formatCFA(sale.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1001 }}>
        {aiChatOpen ? (
          <div style={{
            width: '340px',
            maxHeight: '460px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#1E293B',
            borderRadius: '12px',
            border: '1px solid #D9A05B',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              borderBottom: '1px solid #334155',
              background: 'rgba(15, 23, 42, 0.5)',
            }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#F1F5F9' }}>✨ Bflow AI Assistant</span>
              <button
                onClick={() => setAiChatOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxHeight: '300px',
            }}>
              {aiChatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    background: msg.role === 'user' ? '#D9A05B' : 'rgba(15, 23, 42, 0.8)',
                    color: msg.role === 'user' ? '#FFFFFF' : '#CBD5E1',
                    border: msg.role === 'user' ? 'none' : '1px solid #334155',
                  }}
                >
                  {msg.text}
                </div>
              ))}
              {aiChatLoading && (
                <div style={{
                  alignSelf: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontStyle: 'italic',
                  color: '#D9A05B',
                  border: '1px solid #334155',
                  background: 'rgba(15, 23, 42, 0.8)',
                }}>
                  ✨ Bflow AI is analyzing...
                </div>
              )}
            </div>
            <form onSubmit={handleAiChatSend} style={{ padding: '12px 16px', borderTop: '1px solid #334155', display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="premium-input"
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                placeholder="e.g., Which agent brought in the most revenue this week?"
                disabled={aiChatLoading}
                style={{ flex: 1, fontSize: '13px', background: '#0F172A', color: '#F1F5F9' }}
              />
              <button
                type="submit"
                className="brand-btn"
                disabled={aiChatLoading}
                style={{
                  backgroundColor: '#D9A05B',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Send
              </button>
            </form>
          </div>
        ) : (
          <button
            className="ai-chat-fab"
            onClick={() => setAiChatOpen(true)}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '2px solid #D9A05B',
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              color: '#F1F5F9',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              lineHeight: '1.2',
              padding: '8px',
            }}
          >
            ✨ Bflow AI
          </button>
        )}
      </div>

      {receipt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '24px',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.35)',
          }}>
            <div id="receipt-print-area" style={{ color: '#1E293B' }}>
              <h2 style={{ textAlign: 'center', fontSize: '18px', fontWeight: '700', margin: '0 0 0.5rem', letterSpacing: '0.05em' }}>
                BFLOW BOOKSHOP RECEIPT
              </h2>
              <p style={{ textAlign: 'center', fontSize: '12px', color: '#64748B', margin: '0 0 1.5rem' }}>
                {receipt.timestamp.toLocaleDateString()} · {receipt.timestamp.toLocaleTimeString()}
              </p>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 1rem' }}>
                Cashier: <strong style={{ color: '#334155' }}>{receipt.cashier}</strong>
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', color: '#64748B' }}>Title</th>
                    <th style={{ textAlign: 'center', padding: '8px 0', color: '#64748B' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', color: '#64748B' }}>Price</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', color: '#64748B' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 0', fontWeight: '500' }}>{item.title}</td>
                      <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.qty}</td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>{formatCFA(item.price)}</td>
                      <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '600' }}>{formatCFA(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700', borderTop: '2px solid #1E293B', paddingTop: '1rem' }}>
                <span>Total</span>
                <span>{formatCFA(receipt.total)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '1.5rem' }}>
              <button
                className="brand-btn"
                onClick={handlePrintReceipt}
                style={{
                  flex: 1,
                  backgroundColor: '#D9A05B',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 24px',
                  cursor: 'pointer',
                }}
              >
                Print Receipt
              </button>
              <button
                onClick={() => setReceipt(null)}
                style={{
                  flex: 1,
                  background: '#F1F5F9',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}