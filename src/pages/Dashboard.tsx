import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
} from '@mui/material';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, ExternalHyperlink } from 'docx';
import axios from 'axios';
import React from 'react';

interface SearchResult {
  position: number;
  url: string;
  screenshot?: string;
  customScreenshot?: string;
  screenshotDate?: string;
}

interface KeywordResult {
  keyword: string;
  locations: string[];
  results: Map<string, SearchResult[]>;
}

const Dashboard: React.FC = () => {
  const [keywords, setKeywords] = useState<string>('');
  const [urls, setUrls] = useState<string>('');  // Changed from string[] to string
  const [locations, setLocations] = useState<string>('');  // Changed from string[] to string
  const [uploadedData, setUploadedData] = useState<File | null>(null);
  const [results, setResults] = useState<KeywordResult[]>([]);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('serpApiKey') || '');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [urlScreenshots, setUrlScreenshots] = useState<Map<string, { file: string, date: string }>>(
    new Map()
  );

  const handleScreenshotUpload = (url: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const newScreenshots = new Map(urlScreenshots);
        const today = new Date();
        const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear().toString().substr(-2)}`;
        newScreenshots.set(url, { file: e.target?.result as string, date: formattedDate });
        setUrlScreenshots(newScreenshots);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type !== 'text/csv') {
        setError('Please upload a CSV file');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          const parsedData = lines.slice(1).map(line => {
            const [keyword, url] = line.split(',').map(item => item.trim());
            return { keyword, url };
          });
          
          // Update keywords and URLs separately
          const keywordList = parsedData.map(item => item.keyword).filter(Boolean);
          const urlList = parsedData.map(item => item.url).filter(Boolean);
          
          setKeywords(keywordList.join('\n'));
          setUrls(urlList.join('\n')); // Changed to join with newlines instead of setting array
          setUploadedData(file);
        } catch (err) {
          setError('Error parsing CSV file. Please ensure it contains keywords and URLs in separate columns.');
        }
      };
      reader.readAsText(file);
    }
  };

const handleAnalyze = async () => {
  if (!apiKey || apiKey.trim().length < 10) {
    setError('Please enter a valid SERP API key');
    return;
  }

  localStorage.setItem('serpApiKey', apiKey);

  if (!locations.trim()) {
    setError('Please enter at least one location');
    return;
  }

  if (!keywords.trim()) {
    setError('Please enter at least one keyword or upload a CSV file');
    return;
  }

  setLoading(true);
  setError('');

  try {
    const testParams = {
      api_key: apiKey,
      q: 'serpapi test query',
      location: 'United States',
      google_domain: 'google.com',
      gl: 'us',
      hl: 'en',
      num: 1,
      safe: 'active'
    };

    await axios.get(`${process.env.REACT_APP_API_BASE_URL}/api/serp`, { params: testParams });

    const keywordList = keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);
    const locationList = locations.split('\n').map(loc => loc.trim()).filter(loc => loc.length > 0);

    if (keywordList.length === 0) {
      throw new Error('No valid keywords found');
    }

    const searchResults: KeywordResult[] = [];
    const maxRequestsPerMinute = 60;
    let requestCount = 0;

    for (const keyword of keywordList) {
      const keywordResult: KeywordResult = {
        keyword,
        locations: locationList,
        results: new Map()
      };

      for (const location of locationList) {
        if (requestCount >= maxRequestsPerMinute) {
          await new Promise(resolve => setTimeout(resolve, 60000));
          requestCount = 0;
        }

        const allOrganicResults: any[] = [];

        // Pagination for up to 50 results (5 pages x 10 results)
        for (let start = 0; start < 50; start += 10) {
          const paginatedParams = {
            api_key: apiKey,
            q: keyword,
            location: location,
            google_domain: 'google.com',
            gl: 'us',
            hl: 'en',
            num: 10,
            start: start,
            safe: 'active'
          };

          try {
            const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/api/serp`, {
              params: paginatedParams
            });

            const organicResults = response.data.organic_results || [];
            allOrganicResults.push(...organicResults);

            requestCount++;

            if (organicResults.length < 10) break; // No more results, stop pagination
          } catch (paginationError: any) {
            console.error(`Error fetching page at start=${start} for ${keyword} in ${location}`, paginationError);
            break; // Stop pagination on error
          }
        }

        console.log('Results for keyword:', keyword, 'in', location, '→', allOrganicResults.length);

        keywordResult.results.set(
          location,
          allOrganicResults.map((result: any, index: number) => {
            const url = result.link || '';
            const screenshotInfo = urlScreenshots.get(url);
            return {
              position: index + 1,
              url,
              screenshot: result.thumbnail || null,
              customScreenshot: screenshotInfo ? screenshotInfo.file : undefined,
              screenshotDate: screenshotInfo ? screenshotInfo.date : undefined
            };
          })
        );
      }

      searchResults.push(keywordResult);
    }

    if (searchResults.length === 0) {
      throw new Error('No search results found');
    }

    setResults(searchResults);
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401) {
        setError('Invalid API key. Please check your SERP API key and try again.');
      } else if (err.response?.status === 429) {
        setError('API rate limit exceeded. Please wait a moment and try again.');
      } else if (!err.response) {
        setError('Network error. Please check your internet connection and ensure the proxy server is running.');
      } else {
        setError(`API Error: ${err.response.data?.error || err.message || 'Unknown error occurred'}`);
      }
    } else {
      setError(err.message || 'Error fetching search results. Please try again.');
    }
    console.error('SERP API Error:', err);
  } finally {
    setLoading(false);
  }
};


  const handleExport = async () => {
    // Get the list of user-entered URLs
    const userUrls = urls.split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun({ text: "SERP Analysis Report" })],
              heading: HeadingLevel.TITLE,
              alignment: "center",
              spacing: { after: 200 }
            })
          ]
        },
        ...results.flatMap((keywordResult) => ({
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: keywordResult.keyword,
                  size: 32,
                  bold: true
                })
              ],
              spacing: {
                after: 200
              },
              heading: HeadingLevel.HEADING_1,
              alignment: "center"
            }),
            ...keywordResult.locations.flatMap(location => [
              new Paragraph({
                children: [new TextRun({ text: `Location: ${location}`, bold: true, size: 28 })],
                spacing: {
                  after: 200
                },
                heading: HeadingLevel.HEADING_2
              }),
              ...Array.from(keywordResult.results.get(location) || [])
                // Include all user-entered URLs, regardless of screenshot availability
                .filter(result => 
  userUrls.some(userUrl => result.url.includes(userUrl))
)
                .flatMap(result => [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `Position: ${result.position}`, size: 24, bold: true })
                    ],
                    spacing: {
                      after: 100
                    }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: `Link: `, size: 24, bold: true }),
                      new ExternalHyperlink({
                        children: [
                          new TextRun({
                            text: result.url,
                            style: "Hyperlink"
                          })
                        ],
                        link: result.url
                      })
                    ],
                    spacing: {
                      after: 100
                    }
                  }),
                  // Screenshot centered - add if customScreenshot exists, otherwise use search result screenshot
                  new Paragraph({
                    children: [
                      new ImageRun({
                        type: "jpg",
                        data: result.customScreenshot
                          ? Uint8Array.from(atob(result.customScreenshot.split(',')[1]), c => c.charCodeAt(0))
                          : result.screenshot
                            ? Uint8Array.from(atob(result.screenshot.split(',')[1]), c => c.charCodeAt(0))
                            : new Uint8Array(0),
                        transformation: {
                          width: 381,
                          height: 118
                        }
                      })
                    ],
                    alignment: "center",
                    spacing: { after: 100 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ 
                        text: result.screenshotDate 
                          ? `Screenshot taken on ${result.screenshotDate}` 
                          : "Screenshot from search results"
                      })
                    ],
                    alignment: "center",
                    spacing: { after: 200 }
                  })
                ])
            ])
          ]
        }))
      ]
    });
    
    const blob = await Packer.toBlob(doc);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'serp-analysis.docx';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                SERP Analysis Configuration
              </Typography>
              <TextField
                fullWidth
                label="SERP API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                margin="normal"
                type="password"
              />
              <TextField
                fullWidth
                label="Keywords (one per line)"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                margin="normal"
                multiline
                rows={4}
              />
              <TextField
                fullWidth
                label="URLs to track (one per line)"
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                margin="normal"
                multiline
                rows={4}
              />
              <TextField
                fullWidth
                label="Locations (one per line)"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                margin="normal"
                multiline
                rows={4}
              />
              <Box sx={{ mt: 2 }}>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  id="csv-upload"
                />
                <label htmlFor="csv-upload">
                  <Button variant="contained" component="span" sx={{ mr: 2 }}>
                    Upload CSV
                  </Button>
                </label>
                <Button
                  variant="contained"
                  onClick={handleAnalyze}
                  disabled={loading}
                  sx={{ mr: 2 }}
                >
                  Analyze
                </Button>
                {results.length > 0 && (
                  <Button
                    variant="contained"
                    onClick={handleExport}
                    disabled={loading}
                    color="secondary"
                  >
                    Export to Word
                  </Button>
                )}
              </Box>
              {loading && (
                <Box sx={{ width: '100%', mt: 2 }}>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Analyzing... Please wait
                  </Typography>
                  <LinearProgress />
                </Box>
              )}
              {error && (
                <Typography color="error" sx={{ mt: 2 }}>
                  {error}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>URLs and Screenshots</Typography>
                {urls.split('\n')
                  .map(url => url.trim())
                  .filter(url => url.length > 0)
                  .map((url, index) => (
                    <Box key={index} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography sx={{ flex: 1 }}>{url}</Typography>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleScreenshotUpload(url)}
                        style={{ display: 'none' }}
                        id={`screenshot-upload-${index}`}
                      />
                      <label htmlFor={`screenshot-upload-${index}`}>
                        <Button
                          variant="outlined"
                          component="span"
                          size="small"
                        >
                          {urlScreenshots.has(url) ? 'Update Screenshot' : 'Add Screenshot'}
                        </Button>
                      </label>
                      {urlScreenshots.has(url) && (
                        <Typography variant="caption" color="textSecondary">
                          Added: {urlScreenshots.get(url)?.date}
                        </Typography>
                      )}
                    </Box>
                  ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;