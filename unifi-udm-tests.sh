#!/bin/bash

# UniFi UDM/Cloud Gateway API Tests
# These controllers need /proxy/network prefix for API calls

CONTROLLER="https://47.199.106.32:8443"
API_KEY="Uz0CvgeS2Zn5O3y46DvNzloXw_fLDeVu"
SITE="default"

echo "=========================================="
echo "UniFi UDM/Cloud Gateway API Tests"
echo "=========================================="
echo ""
echo "Controller: $CONTROLLER"
echo "API Key: $API_KEY"
echo ""
echo "UDM/UCG controllers require /proxy/network prefix!"
echo ""

# Test 1: Active Clients with /proxy/network prefix
echo "----------------------------------------"
echo "Test 1: Active Clients (UDM Format)"
echo "GET $CONTROLLER/proxy/network/api/s/$SITE/stat/sta"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/proxy/network/api/s/$SITE/stat/sta" 2>&1 | grep -A 5 "< HTTP"
echo -e "\n\n"

# Test 2: All Devices with /proxy/network prefix
echo "----------------------------------------"
echo "Test 2: All Devices (UDM Format)"
echo "GET $CONTROLLER/proxy/network/api/s/$SITE/stat/device"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/proxy/network/api/s/$SITE/stat/device" 2>&1 | grep -A 5 "< HTTP"
echo -e "\n\n"

# Test 3: Controller status with /proxy/network
echo "----------------------------------------"
echo "Test 3: Controller Status (UDM Format)"
echo "GET $CONTROLLER/proxy/network/api/status"
echo "----------------------------------------"
curl -k -v \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/proxy/network/api/status" 2>&1 | grep -A 5 "< HTTP"
echo -e "\n\n"

# Test 4: Full response for active clients
echo "----------------------------------------"
echo "Test 4: Full Active Clients Response"
echo "----------------------------------------"
curl -k -s \
  -H "Accept: application/json" \
  -H "X-API-KEY: $API_KEY" \
  "$CONTROLLER/proxy/network/api/s/$SITE/stat/sta" | head -50
echo ""

echo "=========================================="
echo "Tests Complete!"
echo "=========================================="