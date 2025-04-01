# UN Security Council Consolidated List Fetcher

This project is designed to fetch and display the United Nations Security Council Consolidated List. It allows users to upload their own data files and compare them against the consolidated list.

## Project Structure

```
my-js-project
├── src
│   ├── main.html          # Main HTML structure and user interface
│   └── test
│       └── fetchUNListTest.js  # Testing script for fetching and displaying the UN list
├── package.json           # Configuration file for npm
└── README.md              # Documentation for the project
```

## Features

- Fetches the UN Security Council Consolidated List from an external XML source.
- Allows users to upload their own data files in TXT, CSV, or XLSX formats.
- Compares user data against the consolidated list and displays matches.
- Displays the consolidated list in alphabetical order.

## Getting Started

1. Clone the repository:
   ```
   git clone <repository-url>
   ```

2. Navigate to the project directory:
   ```
   cd my-js-project
   ```

3. Install dependencies:
   ```
   npm install
   ```

4. Open `src/main.html` in a web browser to use the application.

## Usage

- Upload your data file using the provided interface.
- Click "Compare" to see matches with the UN Security Council Consolidated List.
- Click "Show UN List" to view the entire list in alphabetical order.

## Testing

To run the tests, execute the script located in `src/test/fetchUNListTest.js`. This script will fetch the UN list and display it in alphabetical order.

## License

This project is licensed under the MIT License.