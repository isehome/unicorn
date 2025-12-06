import Papa from 'papaparse';

const mockLutronCsv = `908275

Order #,Order Date,PO #,Line #,Model #,Qty,Location,Est. Ship Date,Status,Payment Status,Tracking #,Shipped On Date
29254818,26-Nov-2025,THOMAS,1.000,QSFRJ-S2A13-B,1.000000000000,Chihuahua, MX,18-Dec-2025,In Queue,Unpaid,,
29254818,26-Nov-2025,THOMAS,5.000,QSYWJ-S10A13,1.000000000000,ASHLAND, VA,18-Dec-2025,Shipped,Unpaid,484288112287,04-Dec-2025
`;

const parseLutronCsv = (csvText) => {
    // 1. Find the header line
    const lines = csvText.split(/\r\n|\n/);
    const headerIndex = lines.findIndex(line => line.includes('Order #') && line.includes('Model #'));

    if (headerIndex === -1) {
        throw new Error('Could not find Lutron CSV headers');
    }

    // 2. Extract content starting from header
    const cleanCsv = lines.slice(headerIndex).join('\n');

    return new Promise((resolve, reject) => {
        Papa.parse(cleanCsv, {
            header: true,
            skipEmptyLines: true,
            complete: ({ data }) => {
                resolve(data);
            },
            error: (err) => reject(err)
        });
    });
};

const runTest = async () => {
    try {
        const data = await parseLutronCsv(mockLutronCsv);
        console.log('Parsed Data Length:', data.length);
        console.log('First Item:', data[0]);
        console.log('Second Item (Shipped):', data[1]);

        // Test detection logic
        const isLutron = mockLutronCsv.includes('Order #') && mockLutronCsv.includes('Model #');
        console.log('Is Lutron:', isLutron);

    } catch (err) {
        console.error(err);
    }
};

runTest();
