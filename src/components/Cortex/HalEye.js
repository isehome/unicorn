import React, { useMemo } from 'react';

const HalEye = ({ state = 'idle', audioLevel = 0 }) => {
  // Ensure audioLevel is between 0 and 1
  const normalizedAudioLevel = Math.max(0, Math.min(1, audioLevel || 0));

  // Color and animation configs for each state
  const stateConfig = useMemo(() => {
    const configs = {
      idle: {
        primaryColor: '#FCD34D', // amber-300
        secondaryColor: '#F59E0B', // amber-500
        glowColor: 'rgba(252, 211, 77, 0.6)',
        animation: 'breathing 4s ease-in-out infinite',
        innerGradient: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3), rgba(252, 211, 77, 0.8))',
        ringColor: 'rgba(252, 211, 77, 0.4)',
      },
      listening: {
        primaryColor: '#06B6D4', // cyan-500
        secondaryColor: '#0891B2', // cyan-600
        glowColor: 'rgba(6, 182, 212, 0.7)',
        animation: 'none',
        innerGradient: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.5), rgba(6, 182, 212, 0.9))',
        ringColor: 'rgba(6, 182, 212, 0.5)',
      },
      thinking: {
        primaryColor: '#A78BFA', // purple-400
        secondaryColor: '#7C3AED', // violet-600
        glowColor: 'rgba(167, 139, 250, 0.6)',
        animation: 'rotating 3s linear infinite',
        innerGradient: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.2), rgba(167, 139, 250, 0.85))',
        ringColor: 'rgba(167, 139, 250, 0.4)',
      },
      speaking: {
        primaryColor: '#2DD4BF', // teal-400
        secondaryColor: '#14B8A6', // teal-600
        glowColor: 'rgba(45, 212, 191, 0.6)',
        animation: 'none',
        innerGradient: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), rgba(45, 212, 191, 0.9))',
        ringColor: 'rgba(45, 212, 191, 0.5)',
      },
    };
    return configs[state] || configs.idle;
  }, [state]);

  // Dynamically calculate ring expansion for listening state
  const ringScale = state === 'listening' ? 1 + normalizedAudioLevel * 0.3 : 1;
  const ringOpacity = state === 'listening' ? 0.3 + normalizedAudioLevel * 0.4 : 0.4;

  // Dynamically calculate pulse intensity for speaking state
  const pulseIntensity = state === 'speaking' ? normalizedAudioLevel : 1;

  const styles = `
    @keyframes breathing {
      0%, 100% {
        box-shadow: 0 0 20px ${stateConfig.glowColor};
        opacity: 1;
      }
      50% {
        box-shadow: 0 0 40px ${stateConfig.glowColor};
        opacity: 0.7;
      }
    }

    @keyframes rotating {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }

    @keyframes shimmer {
      0%, 100% {
        background: conic-gradient(
          from 0deg,
          ${stateConfig.primaryColor},
          ${stateConfig.secondaryColor},
          ${stateConfig.primaryColor}
        );
      }
      50% {
        background: conic-gradient(
          from 180deg,
          ${stateConfig.secondaryColor},
          ${stateConfig.primaryColor},
          ${stateConfig.secondaryColor}
        );
      }
    }

    @keyframes speakingPulse {
      0%, 100% {
        box-shadow: 0 0 20px ${stateConfig.glowColor};
      }
      50% {
        box-shadow: 0 0 ${40 * pulseIntensity}px ${stateConfig.glowColor};
      }
    }

    @keyframes ringExpand {
      0%, 100% {
        transform: scale(1);
        opacity: 0.3;
      }
      50% {
        transform: scale(${ringScale});
        opacity: ${ringOpacity};
      }
    }

    .hal-eye-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
    }

    .hal-eye-wrapper {
      position: relative;
      width: 200px;
      height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Outermost decorative ring (always present, state-dependent) */
    .hal-eye-outer-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 2px solid ${stateConfig.ringColor};
      border-radius: 50%;
      ${state === 'listening' ? `animation: ringExpand 1.5s ease-in-out infinite;` : ''}
      pointer-events: none;
    }

    /* Main eye container with concentric rings */
    .hal-eye-main {
      position: relative;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: ${stateConfig.innerGradient};
      border: 3px solid ${stateConfig.primaryColor};
      box-shadow: inset 0 -10px 20px rgba(0, 0, 0, 0.4),
                  inset 0 2px 10px rgba(255, 255, 255, 0.2);
      ${state === 'thinking' ? `animation: shimmer 2s ease-in-out infinite, ${stateConfig.animation};` : ''}
      ${state === 'speaking' ? `animation: speakingPulse 0.8s ease-in-out infinite;` : ''}
      ${state === 'idle' || state === 'listening' ? `animation: ${stateConfig.animation};` : ''}
      overflow: hidden;
    }

    /* Second ring (depth layer) */
    .hal-eye-ring-2 {
      position: absolute;
      width: 120px;
      height: 120px;
      border: 1px solid ${stateConfig.secondaryColor};
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0.5;
      pointer-events: none;
    }

    /* Third ring (depth layer) */
    .hal-eye-ring-3 {
      position: absolute;
      width: 80px;
      height: 80px;
      border: 1px solid ${stateConfig.primaryColor};
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0.6;
      pointer-events: none;
    }

    /* Inner lens circle */
    .hal-eye-lens {
      position: absolute;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.4), ${stateConfig.primaryColor});
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow: inset 0 -4px 8px rgba(0, 0, 0, 0.6),
                  0 0 15px ${stateConfig.glowColor};
      pointer-events: none;
    }

    /* Reflection/highlight dot */
    .hal-eye-reflection {
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.2));
      top: 28%;
      left: 28%;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
      pointer-events: none;
    }

    /* State label */
    .hal-eye-label {
      font-size: 0.875rem;
      font-weight: 500;
      text-transform: capitalize;
      color: #a1a1a1;
      letter-spacing: 0.05em;
      min-height: 1.25rem;
      transition: color 0.3s ease;
    }

    .hal-eye-label.idle {
      color: #a1a1a1;
    }

    .hal-eye-label.listening {
      color: #06B6D4;
      font-weight: 600;
    }

    .hal-eye-label.thinking {
      color: #A78BFA;
      font-weight: 600;
    }

    .hal-eye-label.speaking {
      color: #2DD4BF;
      font-weight: 600;
    }

    @media (max-width: 768px) {
      .hal-eye-wrapper {
        width: 140px;
        height: 140px;
      }

      .hal-eye-main {
        width: 112px;
        height: 112px;
      }

      .hal-eye-ring-2 {
        width: 84px;
        height: 84px;
      }

      .hal-eye-ring-3 {
        width: 56px;
        height: 56px;
      }

      .hal-eye-lens {
        width: 42px;
        height: 42px;
      }

      .hal-eye-reflection {
        width: 12px;
        height: 12px;
      }

      .hal-eye-label {
        font-size: 0.8rem;
      }
    }
  `;

  const getStateLabel = () => {
    switch (state) {
      case 'listening':
        return 'Listening...';
      case 'thinking':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking...';
      case 'idle':
      default:
        return 'Cortex Ready';
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="hal-eye-container">
        <div className="hal-eye-wrapper">
          <div className="hal-eye-outer-ring" />
          <div className="hal-eye-main">
            <div className="hal-eye-ring-2" />
            <div className="hal-eye-ring-3" />
            <div className="hal-eye-lens" />
            <div className="hal-eye-reflection" />
          </div>
        </div>
        <div className={`hal-eye-label ${state}`}>
          {getStateLabel()}
        </div>
      </div>
    </>
  );
};

export default HalEye;
