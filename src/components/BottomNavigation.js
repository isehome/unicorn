import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, QrCode, Home, Boxes, Headphones } from 'lucide-react';
import { partsService } from '../services/partsService';

const BottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [newPartsCount, setNewPartsCount] = useState(0);

  // Fetch new parts count on mount and when location changes
  useEffect(() => {
    const fetchNewPartsCount = async () => {
      try {
        const count = await partsService.getNewPartsCount();
        setNewPartsCount(count);
      } catch (error) {
        console.error('Failed to fetch new parts count:', error);
      }
    };

    fetchNewPartsCount();

    // Set up polling to refresh count every 60 seconds
    const interval = setInterval(fetchNewPartsCount, 60000);

    // Listen for custom event when parts are marked as reviewed
    const handlePartsReviewed = () => {
      fetchNewPartsCount();
    };
    window.addEventListener('parts-reviewed', handlePartsReviewed);

    return () => {
      clearInterval(interval);
      window.removeEventListener('parts-reviewed', handlePartsReviewed);
    };
  }, [location.pathname]);

  // Get default home path based on user preference
  const getHomePath = () => {
    const defaultWorkspace = localStorage.getItem('default-workspace-mode');
    return defaultWorkspace === 'pm' ? '/pm-dashboard' : '/';
  };

  const homePath = getHomePath();

  const navItems = [
    { icon: Home, label: 'Home', path: homePath, isHome: true },
    { icon: Headphones, label: 'Service', path: '/service' },
    { icon: Boxes, label: 'Parts', path: '/parts', badge: newPartsCount },
    { icon: Users, label: 'People', path: '/people' },
    { icon: QrCode, label: 'Scan Tag', path: '/scan-tag' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-gray-700 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex justify-around items-center" style={{ minHeight: '60px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          // For Home button, check if on either dashboard
          const isActive = item.isHome
            ? location.pathname === '/' || location.pathname === '/pm-dashboard'
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center gap-1 py-2 px-3 transition-colors ${isActive
                ? 'text-violet-500'
                : 'text-gray-600 dark:text-gray-400 hover:text-violet-500'
                }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavigation;
