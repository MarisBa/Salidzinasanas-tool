require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const xml2js = require('xml2js');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});

app.use(express.static(path.join(__dirname, 'public')));

// Route for your main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// Add your OFAC API routes here...
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.static(path.join(__dirname, 'public')));

// OFAC XML file URL
const OFAC_XML_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
const CACHE_FILE = path.join(__dirname, 'ofac-cache.json');


const EU_XML_URL = 'https://sankcijas.fid.gov.lv/files/xmlFullSanctionsList_1_1.xml';
const EU_CACHE_FILE = path.join(__dirname, 'eu-cache.json');


// Cache for storing parsed data
let sanctionsCache = {
  data: [],
  lastUpdated: null,
  count: 0
};

let euSanctionsCache = {
  data: [],
  lastUpdated: new Date().toISOString(),
  count: 0
};

// Function to save cache to file
async function saveCacheToFile() {
  try {
    await writeFile(CACHE_FILE, JSON.stringify(sanctionsCache, null, 2));
    console.log('Cache saved to file');
  } catch (err) {
    console.error('Error saving cache to file:', err);
  }
}

// Function to load cache from file
async function loadCacheFromFile() {
  try {
    const data = await readFile(CACHE_FILE, 'utf8');
    sanctionsCache = JSON.parse(data);
    console.log('Cache loaded from file');
    return true;
  } catch (err) {
    console.log('No cache file found or error reading it');
    return false;
  }
}

// Function to fetch and parse OFAC data
async function fetchOFACData() {
  try {
    console.log('Fetching latest OFAC data...');
    const response = await axios.get(OFAC_XML_URL, {
      timeout: 30000,
      responseType: 'text'
    });

    // Parse XML to JSON
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    // Extract sanction entries
    const entries = result.sdnList.sdnEntry || [];
    
    // Transform to simpler format
    const simplifiedEntries = entries.map(entry => ({
      uid: entry.uid,
      name: `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || entry.sdnType,
      type: entry.sdnType,
      programs: entry.programList ? (Array.isArray(entry.programList.program) ? 
        entry.programList.program.join(', ') : entry.programList.program) : 'N/A',
      countries: entry.citizenshipList ? (Array.isArray(entry.citizenshipList.citizenship) ? 
        entry.citizenshipList.citizenship.join(', ') : entry.citizenshipList.citizenship) : 'N/A',
      addresses: entry.addressList ? 
        (Array.isArray(entry.addressList.address) ? 
          entry.addressList.address.map(a => `${a.address1 || ''} ${a.city || ''} ${a.country || ''}`.trim()).join('; ') 
          : `${entry.addressList.address.address1 || ''} ${entry.addressList.address.city || ''} ${entry.addressList.address.country || ''}`.trim()) 
        : 'N/A',
      remarks: entry.remarks || 'N/A',
      dateOfBirth: entry.dateOfBirthList ? 
        (Array.isArray(entry.dateOfBirthList.dateOfBirth) ? 
          entry.dateOfBirthList.dateOfBirth.join(', ') 
          : entry.dateOfBirthList.dateOfBirth) 
        : 'N/A'
    }));

    sanctionsCache = {
      data: simplifiedEntries,
      lastUpdated: new Date().toISOString(),
      count: simplifiedEntries.length
    };

    await saveCacheToFile();
    console.log(`Fetched ${simplifiedEntries.length} entries`);
    return simplifiedEntries;
  } catch (error) {
    console.error('Error fetching OFAC data:', error.message);
    throw error;
  }
}

async function fetchEUSanctionsData() {
  try {
    console.log('Fetching latest EU sanctions data from:', EU_XML_URL);
    
    const response = await axios.get(EU_XML_URL, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    // Decode the response using iconv-lite
    const xmlData = iconv.decode(response.data, 'win1257');
    
    // Use cheerio to parse the XML
    const $ = cheerio.load(xmlData, { 
      xmlMode: true,
      decodeEntities: false,
      recognizeSelfClosing: true
    });

    const entries = [];
    
    $('sanctionEntity').each((i, el) => {
      const $el = $(el);
      
      const entry = {
        id: $el.attr('logicalId') || 'N/A',
        euReferenceNumber: $el.attr('euReferenceNumber') || 'N/A',
        firstName: $el.find('nameAlias').attr('firstName') || 'N/A',
        lastName: $el.find('nameAlias').attr('lastName') || 'N/A',
        fullName: $el.find('nameAlias').attr('wholeName') || 'N/A',
        type: $el.find('subjectType').attr('code') || 'N/A',
        remark: $el.find('remark').text().trim() || 'N/A',
        regulation: $el.find('regulation').attr('numberTitle') || 'N/A',
        regulationType: $el.find('regulation').attr('regulationType') || 'N/A',
        regulationDate: $el.find('regulation').attr('publicationDate') || 'N/A',
        regulationUrl: $el.find('regulation publicationUrl').text().trim() || 'N/A',
        programme: $el.find('regulation').attr('programme') || 'N/A',
        gender: $el.find('nameAlias').attr('gender') || 'N/A',
        strong: $el.find('nameAlias').attr('strong') || 'N/A'
      };

      entry.name = entry.fullName !== 'N/A' 
        ? entry.fullName.normalize('NFKC') 
        : `${entry.firstName !== 'N/A' ? entry.firstName.normalize('NFKC') : ''} ${entry.lastName !== 'N/A' ? entry.lastName.normalize('NFKC') : ''}`.trim() || 'Unnamed Entity';
      
      entries.push(entry);
    });

    euSanctionsCache = {
      data: entries,
      lastUpdated: new Date().toISOString(),
      count: entries.length
    };

    await writeFile(EU_CACHE_FILE, JSON.stringify(euSanctionsCache, null, 2));
    console.log(`Fetched ${entries.length} EU entries`);
    return entries;
  } catch (error) {
    console.error('Error fetching EU sanctions data:', error.message);
    throw error;
  }
}
// API Endpoints
app.get('/api/sanctions/list', async (req, res) => {
  try {
    // Check if force refresh is requested
    const forceRefresh = req.query.force === 'true';
    
    if (!forceRefresh && sanctionsCache.data.length > 0) {
      return res.json({
        success: true,
        data: sanctionsCache.data,
        lastUpdated: sanctionsCache.lastUpdated,
        count: sanctionsCache.count,
        _cached: true
      });
    }

    // Fetch fresh data
    const data = await fetchOFACData();
    res.json({
      success: true,
      data,
      lastUpdated: sanctionsCache.lastUpdated,
      count: sanctionsCache.count,
      _cached: false
    });
  } catch (error) {
    console.error('List error:', error);
    
    // Try to return cached data if available
    if (sanctionsCache.data.length > 0) {
      return res.status(200).json({
        success: true,
        data: sanctionsCache.data,
        lastUpdated: sanctionsCache.lastUpdated,
        count: sanctionsCache.count,
        _cached: true,
        _warning: 'Failed to fetch fresh data - serving cached data'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sanctions data',
      message: error.message
    });
  }
});

app.post('/api/sanctions/search', async (req, res) => {
  try {
    const { query, limit = 100 } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Search query is required and must be a string'
      });
    }
    
    const searchTerm = query.toLowerCase();
    const results = sanctionsCache.data.filter(item => {
      return (
        (item.name && item.name.toLowerCase().includes(searchTerm)) ||
        (item.uid && item.uid.toLowerCase().includes(searchTerm)) ||
        (item.countries && item.countries.toLowerCase().includes(searchTerm)) ||
        (item.programs && item.programs.toLowerCase().includes(searchTerm))
      );
    }).slice(0, limit);
    
    res.json({
      success: true,
      data: results,
      count: results.length,
      total: sanctionsCache.count
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message
    });
  }
});

app.get('/api/sanctions/test-connection', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    lastUpdated: sanctionsCache.lastUpdated,
    entryCount: sanctionsCache.count
  });
});


app.post('/api/eu-sanctions/search', async (req, res) => {
  try {
    const { query, limit = 100 } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Search query is required and must be a string'
      });
    }
    
    const searchTerm = query.toLowerCase();
    const results = euSanctionsCache.data.filter(item => {
      return (
        (item.name && item.name.toLowerCase().includes(searchTerm)) ||
        (item.type && item.type.toLowerCase().includes(searchTerm)) ||
        (item.programme && item.programme.toLowerCase().includes(searchTerm)) ||
        (item.regulation && item.regulation.toLowerCase().includes(searchTerm))
      );
    }).slice(0, limit);
    
    res.json({
      success: true,
      data: results,
      count: results.length,
      total: euSanctionsCache.count
    });
    
  } catch (error) {
    console.error('EU Search error:', error);
    res.status(500).json({
      success: false,
      error: 'EU Search failed',
      message: error.message
    });
  }
});

app.get('/api/eu-sanctions/test-connection', (req, res) => {
  res.json({
    success: true,
    message: 'EU Sanctions API is working',
    timestamp: new Date().toISOString(),
    entryCount: euSanctionsCache.count
  });
});


app.get('/api/eu-sanctions/list', async (req, res) => {
  try {
    // Check if force refresh is requested
    const forceRefresh = req.query.force === 'true';
    
    if (!forceRefresh && euSanctionsCache.data.length > 0) {
      return res.json({
        success: true,
        data: euSanctionsCache.data,
        lastUpdated: euSanctionsCache.lastUpdated,
        count: euSanctionsCache.count,
        _cached: true
      });
    }

    // Fetch fresh data
    const data = await fetchEUSanctionsData();
    res.json({
      success: true,
      data,
      lastUpdated: euSanctionsCache.lastUpdated,
      count: euSanctionsCache.count,
      _cached: false
    });
  } catch (error) {
    console.error('EU List error:', error);
    
    // Try to return cached data if available
    if (euSanctionsCache.data.length > 0) {
      return res.status(200).json({
        success: true,
        data: euSanctionsCache.data,
        lastUpdated: euSanctionsCache.lastUpdated,
        count: euSanctionsCache.count,
        _cached: true,
        _warning: 'Failed to fetch fresh data - serving cached data: ' + error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch EU sanctions data',
      message: error.message,
      details: error.stack
    });
  }
});
// Start server
async function startServer() {
  // Load cache from file if available
  await Promise.all([loadCacheFromFile(), loadEUCacheFromFile()]);
  
  // Initial data fetch
  try {
    await Promise.all([fetchOFACData(), fetchEUSanctionsData()]);
  } catch (err) {
    console.error('Initial data fetch failed:', err);
  }
  
  // Start the server
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  // Refresh data every 6 hours
  setInterval(fetchOFACData, 6 * 60 * 60 * 1000);
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

async function loadEUCacheFromFile() {
  try {
    const data = await readFile(EU_CACHE_FILE, 'utf8');
    euSanctionsCache = JSON.parse(data);
    console.log('EU Cache loaded from file');
    return true;
  } catch (err) {
    console.log('No EU cache file found or error reading it');
    return false;
  }
}