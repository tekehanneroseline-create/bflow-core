import React from 'react';
import Header from '../components/header';

function MainLayout({ children, handleLogout, showSignOut = false, contentPadding = '24px' }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Header handleLogout={handleLogout} showSignOut={showSignOut} />
      <main style={{ flex: 1, padding: contentPadding, width: '100%', boxSizing: 'border-box' }}>
        {children}
      </main>
    </div>
  );
}

export default MainLayout;
