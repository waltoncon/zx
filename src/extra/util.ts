import XLSX from 'xlsx';

export const wrap = (s: string, w: number) => s.replace(
    new RegExp(`(?![^\\n]{1,${w}}$)([^\\n]{1,${w}})\\s`, 'g'), '$1\n',
);

export const compare = (key: string) => {
    return (a: Record<string, any>, b: Record<string, any>) => {
        return (a[key] > b[key]) ? 1 : ((b[key] > a[key]) ? -1 : 0);
    };
};

export const xlsxPathToJson = (input: string, options: XLSX.Sheet2JSONOpts & { sheetName?: string } = {}) => {
    const workbook = XLSX.readFile(input);
    const { sheetName = workbook.SheetNames[0], ...rest } = options;
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, rest);
};