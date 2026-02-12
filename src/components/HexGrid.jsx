import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { projects } from '../data/projects';

// Helper to generate hexagonal spiral coordinates (q, r)
function generateSpiral(n) {
    let results = [{ q: 0, r: 0 }];
    if (n === 0) return results;

    for (let k = 1; k <= n; k++) {
        // Ring k
        let q = 0;
        let r = -k;
        let s = k;

        for (let i = 0; i < k; i++) { q++; s--; results.push({ q, r }); } // Move Right
        for (let i = 0; i < k; i++) { r++; s--; results.push({ q, r }); } // Move Down Right
        for (let i = 0; i < k; i++) { q--; r++; results.push({ q, r }); } // Move Down Left
        for (let i = 0; i < k; i++) { q--; s++; results.push({ q, r }); } // Move Left
        for (let i = 0; i < k; i++) { r--; s++; results.push({ q, r }); } // Move Up Left
        for (let i = 0; i < k; i++) { q++; r--; results.push({ q, r }); } // Move Up Right
    }
    return results;
}

// Convert axial to pixel
function hexToPixel(q, r, size) {
    const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
    const y = size * (3 / 2 * r);
    return { x, y };
}

/** Format token count for display on dot */
function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

const HexGrid = ({ projects: inputProjects, onSelectProject, currentTheme = 'default', swapBackgrounds = false, swapDots = false, sessionStatsByProjectCode = {} }) => {
    const hexSize = 60; // Spacing size
    const circleSize = 50; // Visual size
    const coords = useMemo(() => generateSpiral(3), []);

    // Theme Colors
    const colors = {
        ZHONG: 'var(--accent-gold)',
        YANG: currentTheme === 'cosmic' ? '#ff8c42' // Fiery orange-red
            : currentTheme === 'obsidian' ? '#e0f2f1'
            : currentTheme === 'midnight' ? '#fff176'
                    : currentTheme === 'red_blue' ? '#e0e0e0' // Light for contrast
                    : '#e0e0e0',
        YIN: currentTheme === 'cosmic' ? '#6b46c1' // Deep purple-blue
            : currentTheme === 'obsidian' ? '#004d40'
            : currentTheme === 'midnight' ? '#1a237e'
                    : currentTheme === 'red_blue' ? '#1a1a1a'
                    : '#1a1a1a'
    };

    // Background Colors for Yin-Yang split
    const backgroundColors = {
        default: {
            yang: 'rgba(0,0,0,0.2)',
            yin: 'rgba(255,255,255,0.1)'
        },
        obsidian: {
            yang: 'rgba(0,77,64,0.3)', // Dark teal
            yin: 'rgba(224,242,241,0.15)' // Light teal
        },
        midnight: {
            yang: 'rgba(26,35,126,0.3)', // Dark blue
            yin: 'rgba(255,241,118,0.15)' // Light yellow
        },
        red_blue: {
            yang: 'rgba(139,0,0,0.4)', // Dark red
            yin: 'rgba(0,0,139,0.4)' // Dark blue
        },
        crimson_azure: {
            yang: 'rgba(220,20,60,0.4)', // Crimson
            yin: 'rgba(0,127,255,0.4)' // Azure blue
        },
        burgundy_royal: {
            yang: 'rgba(128,0,32,0.4)', // Burgundy
            yin: 'rgba(25,25,112,0.4)' // Royal blue
        },
        cosmic: {
            yang: 'rgba(255,140,66,0.4)', // Fiery orange-red nebula
            yin: 'rgba(107,70,193,0.4)' // Deep purple-blue nebula
        }
    };

    let bgColors = backgroundColors[currentTheme] || backgroundColors.default;
    
    // Swap backgrounds if requested
    if (swapBackgrounds) {
        bgColors = {
            yang: bgColors.yin,
            yin: bgColors.yang
        };
    }

    // Calculate bounding circle for background
    const bgRadius = 3.5 * hexSize * Math.sqrt(3);

    // Explicit Pattern Logic
    const processedProjects = useMemo(() => {
        return coords.map((coord, index) => {
            const { x, y } = hexToPixel(coord.q, coord.r, hexSize);
            const { q, r } = coord;

            let type = 'ZHONG';

            if (index === 0) {
                type = 'ZHONG';
            } else {
                const isTopEye = (q === 1 && r === -2);
                const isBottomEye = (q === -1 && r === 2);

                const topEyeNeighbors = [
                    { q: 2, r: -2 }, { q: 2, r: -3 }, { q: 1, r: -3 }, { q: 0, r: -2 }, { q: 0, r: -1 }, { q: 1, r: -1 }
                ];
                const bottomEyeNeighbors = [
                    { q: 0, r: 2 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -2, r: 2 }, { q: -2, r: 3 }, { q: -1, r: 3 }
                ];

                const isTopNeighbor = topEyeNeighbors.some(n => n.q === q && n.r === r);
                const isBottomNeighbor = bottomEyeNeighbors.some(n => n.q === q && n.r === r);

                if (isTopEye) type = 'YIN';
                else if (isBottomEye) type = 'YANG';
                else if (isTopNeighbor) type = 'YANG';
                else if (isBottomNeighbor) type = 'YIN';
                else {
                    if (x < 0) type = 'YANG';
                    else if (x > 0) type = 'YIN';
                    else type = y < 0 ? 'YANG' : 'YIN';
                }
            }

            // Merge with passed-in project data
            const projectData = inputProjects ? inputProjects.find(p => p.id === index) : projects[index];

            return {
                ...projectData || { id: index, name: `Project ${index}`, status: 'Unknown' },
                x,
                y,
                type
            };
        });
    }, [coords, inputProjects]);

    // Status Color Map
    const statusColors = {
        'Active': 'var(--accent-gold)',
        'In Progress': '#2196f3', // Blue
        'Completed': '#4caf50',   // Green
        'Blocked': '#f44336',     // Red
        'Paused': '#ff9800',      // Orange
        'Pending': null           // Use default Yin/Yang
    };

    // Check if a project has been initialized with info
    const hasProjectInfo = (proj) => {
        // Skip check for ZHONG center (always has info)
        if (proj.id === 0) return true;
        
        // Project has info if:
        // - status is not "Pending" OR
        // - description is not the default "Initialize project details..." OR
        // - name is not the generic "Project X" pattern OR
        // - has history entries
        const hasCustomStatus = proj.status && proj.status !== 'Pending' && proj.status !== 'Unknown';
        const hasCustomDescription = proj.description && proj.description !== 'Initialize project details...';
        const hasCustomName = proj.name && !proj.name.match(/^Project \d+$/);
        const hasHistory = proj.history && proj.history.length > 0;
        
        return hasCustomStatus || hasCustomDescription || hasCustomName || hasHistory;
    };

    return (
        <div className="hex-grid-container">
            {/* Cosmic Background Gradient (for cosmic theme) */}
            {currentTheme === 'cosmic' && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '200vw',
                        height: '200vh',
                        background: `radial-gradient(ellipse at 30% 50%, rgba(255,140,66,0.3) 0%, transparent 50%),
                                    radial-gradient(ellipse at 70% 50%, rgba(107,70,193,0.3) 0%, transparent 50%),
                                    radial-gradient(circle at center, rgba(255,215,0,0.1) 0%, transparent 70%),
                                    linear-gradient(135deg, rgba(20,10,30,0.95) 0%, rgba(10,5,20,0.98) 100%)`,
                        zIndex: -1,
                        pointerEvents: 'none'
                    }}
                />
            )}
            
            {/* Starfield (for cosmic theme) */}
            {currentTheme === 'cosmic' && (
                <svg
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 0,
                        pointerEvents: 'none',
                        opacity: 0.6
                    }}
                >
                    {Array.from({ length: 200 }).map((_, i) => {
                        const x = Math.random() * 100;
                        const y = Math.random() * 100;
                        const size = Math.random() * 1.5 + 0.5;
                        const opacity = Math.random() * 0.8 + 0.2;
                        return (
                            <circle
                                key={i}
                                cx={`${x}%`}
                                cy={`${y}%`}
                                r={size}
                                fill="#fff"
                                opacity={opacity}
                            />
                        );
                    })}
                </svg>
            )}

            {/* Background Circle & S-Curve */}
            <svg
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    overflow: 'visible',
                    zIndex: 0,
                    pointerEvents: 'none' // Ensure clicks pass through
                }}
                width={bgRadius * 2.2} height={bgRadius * 2.2} viewBox="-120 -120 240 240"
            >
                {/* Outer Circle - Made brighter and thicker */}
                <circle cx="0" cy="0" r="110" fill="none" strokeWidth="2" stroke={colors.ZHONG} opacity={currentTheme === 'cosmic' ? "0.8" : "0.5"} />

                {/* Split Backgrounds with enhanced gradients for cosmic theme */}
                {currentTheme === 'cosmic' ? (
                    <>
                        {/* Right Side (Yin) - Purple-blue nebula */}
                        <defs>
                            <radialGradient id="yinNebula" cx="70%" cy="50%">
                                <stop offset="0%" stopColor="rgba(107,70,193,0.6)" />
                                <stop offset="50%" stopColor="rgba(79,70,229,0.4)" />
                                <stop offset="100%" stopColor="rgba(107,70,193,0.2)" />
                            </radialGradient>
                            <radialGradient id="yangNebula" cx="30%" cy="50%">
                                <stop offset="0%" stopColor="rgba(255,140,66,0.6)" />
                                <stop offset="50%" stopColor="rgba(255,107,53,0.4)" />
                                <stop offset="100%" stopColor="rgba(255,140,66,0.2)" />
                            </radialGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                        </defs>
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110 A 110 110 0 0 0 0 -110 Z"
                            fill="url(#yinNebula)"
                            stroke="none"
                        />
                        {/* Left Side (Yang) - Orange-red nebula */}
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110 A 110 110 0 0 1 0 -110 Z"
                            fill="url(#yangNebula)"
                            stroke="none"
                        />
                    </>
                ) : (
                    <>
                        {/* Right Side (Yin) */}
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110 A 110 110 0 0 0 0 -110 Z"
                            fill={bgColors.yin}
                            stroke="none"
                        />
                        {/* Left Side (Yang) */}
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110 A 110 110 0 0 1 0 -110 Z"
                            fill={bgColors.yang}
                            stroke="none"
                        />
                    </>
                )}

                {/* S-Curve Divider (Enhanced for cosmic theme) */}
                {currentTheme === 'cosmic' ? (
                    <>
                        {/* Glowing blur layer */}
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110"
                            fill="none"
                            stroke="rgba(255,215,0,0.3)"
                            strokeWidth="120"
                            strokeLinecap="round"
                            filter="blur(25px)"
                        />
                        {/* Main golden S-curve */}
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110"
                            fill="none"
                            stroke={colors.ZHONG}
                            strokeWidth="4"
                            opacity="0.9"
                            filter="url(#glow)"
                        />
                    </>
                ) : (
                    <>
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110"
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="100"
                            strokeLinecap="round"
                            filter="blur(20px)"
                        />
                        <path
                            d="M 0 -110 C 60 -110, 60 0, 0 0 C -60 0, -60 110, 0 110"
                            fill="none"
                            stroke={colors.ZHONG}
                            strokeWidth="3"
                            opacity="0.6"
                        />
                    </>
                )}
            </svg>

            {processedProjects.map((proj) => {
                const projectHasInfo = hasProjectInfo(proj);
                
                // Determine base background color (original yin/yang/zhong color)
                let baseBackgroundColor = proj.type === 'ZHONG' ? colors.ZHONG :
                    proj.type === 'YANG' ? colors.YANG : colors.YIN;
                
                // Swap dot colors if requested (only for YANG and YIN, not ZHONG)
                if (swapDots && proj.type !== 'ZHONG') {
                    baseBackgroundColor = proj.type === 'YANG' ? colors.YIN : colors.YANG;
                }
                
                // Determine base text color
                const baseTextColor = (proj.type === 'ZHONG') ? '#000' :
                    proj.type === 'YANG' && (currentTheme === 'cosmic' || currentTheme !== 'midnight') ? '#000' : '#fff';
                
                // Status color (if any)
                const statusColor = statusColors[proj.status];
                
                // If there's a status color, use it for border only; otherwise use base background
                const backgroundColor = statusColor ? baseBackgroundColor : baseBackgroundColor;
                const borderColor = statusColor || (proj.type === 'ZHONG' ? '#fff' : 'transparent');
                const borderWidth = statusColor ? '3px' : (proj.type === 'ZHONG' ? '2px' : '0px');
                const borderStyle = proj.status === 'Pending' ? 'dashed' : 'solid';
                
                // For projects without info, use grayed-out ghost appearance
                const isGhost = !projectHasInfo;
                const ghostOpacity = 0.4;
                const ghostBackgroundColor = isGhost 
                    ? `rgba(${proj.type === 'YANG' ? '128,128,128' : '64,64,64'}, ${ghostOpacity})`
                    : backgroundColor;
                
                // Enhanced glow for cosmic theme
                const cosmicGlow = currentTheme === 'cosmic' && !isGhost && proj.status !== 'Pending' 
                    ? `0 0 ${proj.type === 'ZHONG' ? '20px' : '15px'} ${proj.type === 'ZHONG' ? 'rgba(255,215,0,0.8)' : proj.type === 'YANG' ? 'rgba(255,140,66,0.6)' : 'rgba(107,70,193,0.6)'}`
                    : undefined;
                
                return (
                    <motion.div
                        key={proj.id}
                        className="hex-item"
                        style={{
                            left: `calc(50% + ${proj.x}px)`,
                            top: `calc(50% + ${proj.y}px)`,
                            marginLeft: `-${circleSize / 2}px`,
                            marginTop: `-${circleSize / 2}px`,
                            width: `${circleSize}px`,
                            height: `${circleSize}px`,
                            backgroundColor: isGhost ? ghostBackgroundColor : backgroundColor,
                            color: isGhost ? 'rgba(255,255,255,0.5)' : baseTextColor,
                            border: isGhost 
                                ? '1px dashed rgba(255,255,255,0.3)' 
                                : proj.status === 'Pending' 
                                    ? '1px dashed rgba(255,255,255,0.2)' 
                                    : `${borderWidth} solid ${borderColor}`,
                            zIndex: 1,
                            opacity: isGhost ? ghostOpacity : (proj.status === 'Pending' ? 0.3 : 1),
                            boxShadow: cosmicGlow || (isGhost || proj.status === 'Pending' ? 'none' : undefined),
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            filter: currentTheme === 'cosmic' && !isGhost && proj.status !== 'Pending' ? 'drop-shadow(0 0 8px currentColor)' : undefined
                        }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: isGhost ? ghostOpacity : 1, scale: 1 }}
                        transition={{ delay: proj.id * 0.02 }}
                        onClick={() => onSelectProject(proj)}
                        whileHover={isGhost ? { scale: 1.1, opacity: ghostOpacity + 0.1 } : currentTheme === 'cosmic' ? { scale: 1.15, filter: 'drop-shadow(0 0 12px currentColor)' } : { scale: 1.1 }}
                    >
                        {isGhost ? (
                            <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'rgba(255,255,255,0.6)', lineHeight: '1' }}>+</span>
                        ) : proj.id === 0 ? (
                            <span style={{ fontSize: '10px', fontWeight: 'bold' }}>中</span>
                        ) : (() => {
                            const stats = proj.projectCode ? sessionStatsByProjectCode[proj.projectCode] : null;
                            if (!stats || (stats.totalTokens === 0 && stats.totalPrompts === 0)) return null;
                            return (
                                <span style={{
                                    fontSize: '7px',
                                    lineHeight: '1.1',
                                    textAlign: 'center',
                                    display: 'block',
                                    opacity: 0.95,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '100%',
                                    padding: '0 2px'
                                }} title={`${(stats.totalTokens || 0).toLocaleString()} tokens · ${stats.totalPrompts || 0} prompts`}>
                                    {formatTokens(stats.totalTokens || 0)} · {stats.totalPrompts || 0}
                                </span>
                            );
                        })()}
                    </motion.div>
                );
            })}
        </div>
    );
};

export default HexGrid;
