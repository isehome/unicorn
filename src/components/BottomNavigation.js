import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Activity, QrCode, Home, Boxes } from 'lucide-react';

const BottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Boxes, label: 'Parts', path: '/parts' },
    { icon: Users, label: 'People', path: '/people' },
    { icon: Activity, label: 'UniFi Test', path: '/unifi-test' },
    { icon: QrCode, label: 'Scan Tag', path: '/scan-tag' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex justify-around items-center" style={{ minHeight: '60px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 py-2 px-3 transition-colors ${
                isActive 
                  ? 'text-violet-500' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-violet-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavigation;
