#!/usr/bin/env node

/**
 * NexumDesk End-to-End Verification
 * 
 * This script tests the complete flow:
 * 1. Register a test user
 * 2. Login and get JWT token
 * 3. Create an incident
 * 4. List incidents
 * 5. Export database
 * 
 * Run: npm run verify (or ts-node scripts/verify.ts)
 */

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5000/api/v1';
const TEST_USER = {
  username: `test_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  password: 'TestPass123!',
  full_name: 'Test User'
};

const api = axios.create({ baseURL: API_URL });

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verify() {
  try {
    console.log('\n✅ NexumDesk E2E Verification Started\n');

    // 1. Register
    console.log('1️⃣  Registering user...');
    const registerRes = await api.post('/auth/register', TEST_USER);
    console.log(`   ✓ User registered: ${registerRes.data.data.username}`);

    await sleep(100);

    // 2. Login
    console.log('\n2️⃣  Logging in...');
    const loginRes = await api.post('/auth/login', {
      email: TEST_USER.email,
      password: TEST_USER.password
    });
    const token = loginRes.data.data.access_token;
    console.log(`   ✓ Login successful`);
    console.log(`   ✓ Token: ${token.substring(0, 20)}...`);

    // Set token for subsequent requests
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    await sleep(100);

    // 3. Verify current user
    console.log('\n3️⃣  Verifying current user...');
    const meRes = await api.get('/auth/me');
    console.log(`   ✓ Current user: ${meRes.data.data.username} (${meRes.data.data.role})`);

    await sleep(100);

    // 4. Create incident
    console.log('\n4️⃣  Creating incident...');
    const incidentRes = await api.post('/incidents', {
      title: 'E2E Test Incident',
      description: 'Automated test incident',
      severity: 'HIGH',
      service_id: 'test-service',
      detected_at: new Date().toISOString()
    });
    const incidentId = incidentRes.data.data.id;
    console.log(`   ✓ Incident created: ${incidentId}`);
    console.log(`   ✓ Title: ${incidentRes.data.data.title}`);
    console.log(`   ✓ Severity: ${incidentRes.data.data.severity}`);
    console.log(`   ✓ Status: ${incidentRes.data.data.status}`);

    await sleep(100);

    // 5. List incidents
    console.log('\n5️⃣  Listing incidents...');
    const listRes = await api.get('/incidents?limit=5');
    console.log(`   ✓ Total incidents: ${listRes.data.data.pagination.total}`);
    console.log(`   ✓ Incidents in response: ${listRes.data.data.incidents.length}`);

    await sleep(100);

    // 6. Export database
    console.log('\n6️⃣  Exporting database...');
    const exportRes = await api.get('/admin/export');
    const tables = Object.keys(exportRes.data.data);
    console.log(`   ✓ Exported tables: ${tables.join(', ')}`);
    console.log(`   ✓ Users: ${exportRes.data.data.users?.length || 0}`);
    console.log(`   ✓ Incidents: ${exportRes.data.data.incidents?.length || 0}`);

    console.log('\n✅ All tests passed!\n');
    console.log('Summary:');
    console.log(`- User registration: ✓`);
    console.log(`- Authentication: ✓`);
    console.log(`- Incident creation: ✓`);
    console.log(`- Database operations: ✓`);
    console.log(`\nNexumDesk is ready for use!\n`);

  } catch (error: any) {
    console.error('\n❌ Verification failed!\n');
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Error: Cannot connect to backend at', API_URL);
      console.error('\nMake sure the backend is running:');
      console.error('  cd backend && npm run dev');
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

verify();
