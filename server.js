const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://serp-analysis.netlify.app/' 
    : 'http://localhost:3000',
  credentials: true
}));

// Parse JSON request body
app.use(express.json());

// Proxy endpoint for SERP API
app.get('/api/serp', async (req, res) => {
  try {
    // Get query parameters from the request
    const params = req.query;
    
    // Forward the request to SERP API
    const response = await axios.get('https://serpapi.com/search', { params, timeout: 10000 }).catch(err => {
  console.error('SERP API Connection Error:', err.message);
  throw err;
});
    
    // Return the response data
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying request to SERP API:', error);
    
    // Forward the error status and message
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data || error.message
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch data from SERP API' });
  }
});
// app.use(express.static(path.join(__dirname, 'build')));
// // Catch-all route for SPA (React)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'build', 'index.html'));
// });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log('Network access:', 'http://' + (process.env.HOST || 'localhost') + ':' + PORT);
});