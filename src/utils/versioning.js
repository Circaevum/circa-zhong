/**
 * Generates a version string following the schema: cYYQXF#
 * c: Constant
 * YY: Two-digit Year
 * Q: Quarter (Q1-Q4)
 * F: Feature ID (Dot Index)
 * #: Update Index (starts at 1)
 */
export const generateVersion = (date, featureId, updateIndex) => {
    const year = date.getFullYear().toString().slice(-2);
    const month = date.getMonth();
    const quarter = Math.floor(month / 3) + 1;

    // c + YY + Q + F + FeatureID + UpdateIndex
    return `c${year}Q${quarter}F${featureId}${updateIndex}`;
};

export const parseVersion = (versionString) => {
    // c26Q1F12
    const regex = /^c(\d{2})Q(\d)F(\d+)(\d+)$/;
    const match = versionString.match(regex);

    if (!match) return null;

    return {
        year: parseInt(match[1]),
        quarter: parseInt(match[2]),
        featureId: parseInt(match[3]),
        updateIndex: parseInt(match[4])
    };
};
