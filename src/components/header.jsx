import React from 'react';
import logo from '../assets/bflow logo.png';

function Header({ handleLogout, showSignOut = false }) {
  return (
    <header style={styles.headerContainer}>
      <div style={styles.headerContent}>
        <div style={styles.logoContainer}>
          <img src={logo} alt="Bflow Logo" style={styles.logo} />
        </div>
        {showSignOut && (
          <button
            onClick={handleLogout}
            className="logout-btn"
            style={{
              backgroundColor: '#4C6A5A',
              color: '#FFFFFF',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '700',
            }}
          >
            Sign Out
          </button>
        )}
      </div>
    </header>
  );
}

const styles = {
  headerContainer: {
    width: '100%',
    backgroundColor: '#ffffff',
    display: 'flex',
    justifyContent: 'center',
  },
  headerContent: {
    width: '100%',
    padding: '16px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
  },
  logo: {
    height: '75px',
    width: 'auto',
    objectFit: 'contain',
  },
};

export default Header;
