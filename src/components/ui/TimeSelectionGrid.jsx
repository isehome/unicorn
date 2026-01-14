import React, { useMemo, useCallback } from 'react';
import { Clock } from 'lucide-react';

const HOUR_HEIGHT = 60;
const START_HOUR = 6; // 6 AM
const END_HOUR = 22; // 10 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;

const TimeSelectionGrid = ({
    date,
    events = [],
    selectedStartTime,
    selectedDuration = 1,
    onSelectSlot,
    styles,
    palette: rawPalette
}) => {
    // Ensure palette is always a valid object with required properties
    const palette = {
        textSecondary: rawPalette?.textSecondary || '#71717A',
        textPrimary: rawPalette?.textPrimary || '#18181B',
        info: rawPalette?.info || '#3b82f6',
        primary: rawPalette?.primary || '#8b5cf6',
        ...rawPalette
    };
    // Filter events for the selected date
    const dayEvents = useMemo(() => {
        if (!date) return [];
        const dateStr = date.toISOString().split('T')[0];

        return events.filter(event => {
            if (!event.start) return false;
            const eventDate = new Date(event.start).toISOString().split('T')[0];
            return eventDate === dateStr;
        }).map(event => {
            const start = new Date(event.start);
            const end = new Date(event.end);

            const startHour = start.getHours() + start.getMinutes() / 60;
            const endHour = end.getHours() + end.getMinutes() / 60;

            return {
                ...event,
                startHour,
                endHour,
                top: (Math.max(startHour, START_HOUR) - START_HOUR) * HOUR_HEIGHT,
                height: (Math.min(endHour, END_HOUR) - Math.max(startHour, START_HOUR)) * HOUR_HEIGHT
            };
        }).filter(event => event.height > 0);
    }, [events, date]);

    // Calculate selection position
    const selectionPosition = useMemo(() => {
        if (!selectedStartTime) return null;

        const [hours, minutes] = selectedStartTime.split(':').map(Number);
        const startHour = hours + minutes / 60;
        const endHour = startHour + selectedDuration;

        if (startHour < START_HOUR || startHour >= END_HOUR) return null;

        return {
            top: (startHour - START_HOUR) * HOUR_HEIGHT,
            height: selectedDuration * HOUR_HEIGHT,
            label: `${selectedStartTime} - ${formatTime(endHour)}`
        };
    }, [selectedStartTime, selectedDuration]);

    const [isDragging, setIsDragging] = React.useState(false);
    const [dragStartHour, setDragStartHour] = React.useState(null);
    const [currentDragHour, setCurrentDragHour] = React.useState(null);

    const handleMouseDown = (hour) => {
        setIsDragging(true);
        setDragStartHour(hour);
        setCurrentDragHour(hour);
    };

    const handleMouseEnter = (hour) => {
        if (isDragging) {
            setCurrentDragHour(hour);
        }
    };

    const handleMouseUp = useCallback(() => {
        if (isDragging && dragStartHour !== null && currentDragHour !== null) {
            const start = Math.min(dragStartHour, currentDragHour);
            const end = Math.max(dragStartHour, currentDragHour);
            const duration = (end - start) + 1; // +1 to include the end hour slot

            const timeStr = `${String(start).padStart(2, '0')}:00`;
            onSelectSlot(timeStr, duration);
        }
        setIsDragging(false);
        setDragStartHour(null);
        setCurrentDragHour(null);
    }, [isDragging, dragStartHour, currentDragHour, onSelectSlot]);

    // Calculate drag selection visual
    const dragSelection = useMemo(() => {
        if (!isDragging || dragStartHour === null || currentDragHour === null) return null;

        const start = Math.min(dragStartHour, currentDragHour);
        const end = Math.max(dragStartHour, currentDragHour);
        const duration = (end - start) + 1;

        return {
            top: (start - START_HOUR) * HOUR_HEIGHT,
            height: duration * HOUR_HEIGHT,
            label: `${formatTime(start)} - ${formatTime(end + 1)}`
        };
    }, [isDragging, dragStartHour, currentDragHour]);

    // Handle global mouse up to stop dragging if mouse leaves the grid
    React.useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                handleMouseUp();
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isDragging, dragStartHour, currentDragHour, handleMouseUp]);

    function formatTime(decimalTime) {
        const hours = Math.floor(decimalTime);
        const minutes = Math.round((decimalTime - hours) * 60);
        const date = new Date();
        date.setHours(hours, minutes);
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    return (
        <div className="border rounded-xl overflow-hidden bg-white dark:bg-zinc-900" style={{ borderColor: styles.card.borderColor }}>
            <div className="p-3 border-b bg-zinc-50 dark:bg-zinc-800/50 flex justify-between items-center" style={{ borderColor: styles.card.borderColor }}>
                <span className="text-sm font-medium" style={styles.textPrimary}>
                    {date?.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                <div className="flex items-center gap-2 text-xs" style={styles.textSecondary}>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800"></div>
                        <span>Busy</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 border-dashed"></div>
                        <span>Selected</span>
                    </div>
                </div>
            </div>

            <div className="relative overflow-y-auto select-none" style={{ height: '300px' }}>
                {/* Time Grid */}
                {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
                    const hour = START_HOUR + i;
                    return (
                        <div
                            key={hour}
                            className="flex border-b last:border-0 group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                            style={{ height: `${HOUR_HEIGHT}px`, borderColor: styles.card.borderColor }}
                            onMouseDown={() => handleMouseDown(hour)}
                            onMouseEnter={() => handleMouseEnter(hour)}
                        >
                            <div className="w-16 flex-shrink-0 border-r p-2 text-xs text-right" style={{ borderColor: styles.card.borderColor, color: palette.textSecondary }}>
                                {formatTime(hour)}
                            </div>
                            <div className="flex-grow relative">
                                {/* Half-hour guide line */}
                                <div className="absolute w-full border-t border-dashed top-1/2 opacity-20 pointer-events-none" style={{ borderColor: styles.card.borderColor }}></div>
                            </div>
                        </div>
                    );
                })}

                {/* Existing Events */}
                {dayEvents.map(event => (
                    <div
                        key={event.id}
                        className="absolute left-16 right-2 rounded px-2 py-1 text-xs border overflow-hidden pointer-events-none"
                        style={{
                            top: `${event.top}px`,
                            height: `${event.height}px`,
                            backgroundColor: withAlpha(palette.info || '#3b82f6', 0.1),
                            borderColor: withAlpha(palette.info || '#3b82f6', 0.3),
                            color: palette.textPrimary,
                            zIndex: 10
                        }}
                    >
                        <div className="font-medium truncate">{event.subject}</div>
                        <div className="opacity-75 truncate">{formatTime(event.startHour)} - {formatTime(event.endHour)}</div>
                    </div>
                ))}

                {/* Selection Overlay (Drag or Selected) */}
                {(dragSelection || selectionPosition) && (
                    <div
                        className="absolute left-16 right-2 rounded px-2 py-1 text-xs border-2 border-dashed flex flex-col justify-center items-center shadow-sm backdrop-blur-[1px] pointer-events-none"
                        style={{
                            top: `${(dragSelection || selectionPosition).top}px`,
                            height: `${(dragSelection || selectionPosition).height}px`,
                            backgroundColor: withAlpha(palette.primary || '#8b5cf6', 0.15),
                            borderColor: palette.primary || '#8b5cf6',
                            color: palette.primary || '#8b5cf6',
                            zIndex: 20
                        }}
                    >
                        <Clock size={14} className="mb-1" />
                        <div className="font-bold">{(dragSelection || selectionPosition).label}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper to add alpha to hex color
const withAlpha = (hex, alpha) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default TimeSelectionGrid;
