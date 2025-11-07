#!/bin/bash

# UniFi Local Network API - cURL Test Scripts
# These test the controller directly without a browser

CONTROLLER="https://47.199.106.32:8443"
API_KEY="Uz0CvgeS2Zn5O3y46DvNzloXw_fLDeVu"
SITE="default"

echo "=========================================="
echo "UniFi Local Network API - cURL Tests"
echo "=========================================="
echo ""
echo "Controller: $CONTROLLER"
echo "API Key: $API_KEY"
echo "Site: $SITE"
echo ""

# Test 1: Controller Status (no auth)
echo "----------------------------------------"
echo "Test 1: Controller Status (No Auth)"
echo "GET $CONTROLLER/api/status"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  "$CONTROLLER/api/status"
echo -e "\n\n"

# Test 2: Site Health (with API key)
echo "----------------------------------------"
echo "Test 2: Site Health (With API Key)"
echo "GET $CONTROLLER/api/s/$SITE/stat/health"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/api/s/$SITE/stat/health"
echo -e "\n\n"

# Test 3: Active Clients (with API key)
echo "----------------------------------------"
echo "Test 3: Active Clients (With API Key)"
echo "GET $CONTROLLER/api/s/$SITE/stat/sta"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/api/s/$SITE/stat/sta"
echo -e "\n\n"

# Test 4: All Devices (with API key)
echo "----------------------------------------"
echo "Test 4: All Devices (With API Key)"
echo "GET $CONTROLLER/api/s/$SITE/stat/device"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/api/s/$SITE/stat/device"
echo -e "\n\n"

# Test 5: Self Endpoint (with API key)
echo "----------------------------------------"
echo "Test 5: Self/Info Endpoint (With API Key)"
echo "GET $CONTROLLER/api/self"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/api/self"
echo -e "\n\n"

# Test 6: Login Endpoint (check if session auth needed)
echo "----------------------------------------"
echo "Test 6: Login Endpoint (Check Auth Type)"
echo "GET $CONTROLLER/api/login"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  "$CONTROLLER/api/login"
echo -e "\n\n"

echo "=========================================="
echo "Tests Complete!"
echo "=========================================="
echo ""
echo "What to look for:"
echo "  - 200 OK = Success! That endpoint works"
echo "  - 401 Unauthorized = API key rejected or session auth needed"
echo "  - 404 Not Found = Endpoint doesn't exist"
echo "  - CORS error = Expected from browser, but curl works"
echo ""