const fs = require('fs');
const path = require('path');

const outputFilePath = path.join(__dirname, 'file_structure.txt');

function getDirectoryStructure(dirPath, prefix = '', isRoot = false) {
    let result = '';

    if (!fs.existsSync(dirPath)) {
        console.error(`Error: Directory "${dirPath}" does not exist.`);
        return result;
    }

    const items = fs.readdirSync(dirPath);

    items.forEach((item, index) => {
        const itemPath = path.join(dirPath, item);
        const isLastItem = index === items.length - 1;
        const prefixSymbol = isLastItem ? '└── ' : '├── ';

        result += `${prefix}${prefixSymbol}${item}\n`;

        // If it's a directory and NOT "node_modules", recursively get its structure
        if (fs.statSync(itemPath).isDirectory() && item !== 'node_modules') {
            const newPrefix = prefix + (isLastItem ? '    ' : '│   ');
            result += getDirectoryStructure(itemPath, newPrefix);
        }
    });

    return result;
}

// Set the root directory
const rootDir = __dirname; 

if (!fs.existsSync(rootDir)) {
    console.error(`Error: The directory "${rootDir}" does not exist.`);
    process.exit(1);
}

// Get the file structure
const fileStructure = `📂 ${path.basename(rootDir)}\n` + getDirectoryStructure(rootDir, '', true);

// Write to a text file
fs.writeFileSync(outputFilePath, fileStructure, 'utf8');

console.log(`File structure saved to ${outputFilePath}`);
