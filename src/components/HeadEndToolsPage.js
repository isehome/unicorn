import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Server, Wrench } from 'lucide-react';
import Button from './ui/Button';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';

const HeadEndToolsPage = () => {
  const { projectId, wireDropId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const styles = enhancedStyles.base[mode];

  const handleBack = () => {
    if (wireDropId) {
      navigate(`/projects/${projectId}/wire-drops/${wireDropId}`);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Button
          variant="secondary"
          icon={ArrowLeft}
          onClick={handleBack}
        >
          Back
        </Button>
      </div>

      <div className="rounded-2xl overflow-hidden" style={styles.card}>
        <div className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-6">
            <Server size={40} className="text-violet-600 dark:text-violet-400" />
          </div>

          <h1 className="text-2xl font-bold mb-2" style={styles.textPrimary}>
            Head End Tools
          </h1>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium mb-6">
            <Wrench size={16} />
            In Development
          </div>

          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Advanced head end management tools are currently being developed.
            This will include UniFi port assignment, patch panel labeling,
            and network infrastructure mapping.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HeadEndToolsPage;
