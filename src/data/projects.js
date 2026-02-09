import { generateProjectId } from '../utils/project-id';

const totalHexes = 1 + 6 + 12 + 18; // Center + Ring 1 + Ring 2 + Ring 3

export const projects = Array.from({ length: totalHexes }).map((_, i) => {
  if (i === 0) {
    return {
      id: 0,
      name: "Zhong",
      type: "ZHONG",
      status: "Active",
      description: "The Center. Executive oversight.",
      history: [],
      projectCode: generateProjectId({
        date: new Date(),
        type: "ZHONG",
        projectNumber: 0
      })
    };
  }
  
  // Determine type based on position (rough approximation)
  // Ring 1 (1-6): Mix, Ring 2 (7-18): Mix, Ring 3 (19-36): Mix
  // For now, default to WEB, but this can be customized
  const type = i <= 6 ? "WEB" : i <= 18 ? "DATABASE" : "WEB";
  
  return {
    id: i,
    name: `Project ${i}`,
    type: type,
    status: "Pending",
    description: "Initialize project details...",
    history: [],
    projectCode: generateProjectId({
      date: new Date(),
      type: type,
      projectNumber: i
    })
  };
});
