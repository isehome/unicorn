// Just import and use the new StakeholderSlotManager
import StakeholderSlotManager from '../../components/StakeholderSlotManager';

const StakeholderSlots = ({ projectId, theme, ...props }) => {
  return <StakeholderSlotManager projectId={projectId} theme={theme} />;
};

export default StakeholderSlots;