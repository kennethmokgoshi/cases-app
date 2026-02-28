# 🚀 Deployment Synchronization Guide

## Problem Summary
The **live server** (`https://cases.zenowethu.co.za`) is running **outdated code** compared to **localhost**.

## Identified Differences

### 1. ❌ Logo NOT Clickable (Live Server)
- **Localhost**: Logo wrapped in `<Link>` tag, clickable, redirects to dashboard
- **Live Server**: Logo not clickable
- **File**: `app/b2b-dashboard/components/B2BSidebar.tsx` line 93

### 2. ❌ Timeline Missing (Live Server)  
- **Localhost**: Timeline sidebar shows years/months with case counts
- **Live Server**: No timeline visible
- **File**: `app/b2b-dashboard/components/B2BSidebar.tsx` lines 125-190

### 3. ❌ Documents Can't Be Viewed (Live Server)
- **Localhost**: Documents have "View" and "Download" buttons
- **Live Server**: Documents missing view functionality  
- **File**: `app/b2b-dashboard/cases/[id]/CaseDetailContent.tsx` lines 551-572

---

## 🔍 Root Cause

The live server hasn't deployed the latest commits:
- ✅ `715a98e` - Fix: Remove call to undefined getProjectFullPath function
- ✅ `01cc7bb` - Fix: Improve Docker build cache handling for Prisma schema
- ✅ `74da761` - Fix: Add Prisma binaryTargets for Docker deployment
- ✅ And many other recent features (timeline, clickable logo, document viewing)

---

## ✅ Solution: Force Deployment

### Step 1: Check Dokploy Deployment Status
1. Open Dokploy dashboard: `http://[YOUR_VPS_IP]:3000`
2. Login with your credentials
3. Navigate to your `cases-app` application
4. Check the **Deployments** tab
5. Look for the latest deployment status

### Step 2: Trigger Manual Deployment

#### Option A: Via Dokploy UI (Recommended)
1. In Dokploy, go to your application
2. Click the **"Deploy"** button (usually top-right)
3. Select **"Force Rebuild"** or **"Deploy Now"**
4. Monitor the build logs in real-time

#### Option B: Via GitHub Webhook
1. Go to your GitHub repo settings
2. Navigate to **Webhooks**
3. Find the Dokploy webhook URL
4. Click **"Redeliver"** on a recent delivery

#### Option C: Via Git Push (Force)
```bash
# Make a small change to force deployment
git commit --allow-empty -m "Force deployment trigger"
git push origin main
```

### Step 3: Monitor Build Process
Watch for these stages in Dokploy logs:
1. ✅ Cloning repository
2. ✅ Installing dependencies (`npm ci`)
3. ✅ Generating Prisma client (`npx prisma generate`)
4. ✅ Building Next.js (`npm run build`)
5. ✅ Starting container
6. ✅ Application ready

**Expected Build Time**: 3-5 minutes

### Step 4: Verify Deployment
After deployment completes, test these features:

#### Test 1: Logo Clickability
- Navigate to: `https://cases.zenowethu.co.za/b2b-dashboard`
- Click the ZENOWETHU logo (top-left)
- Should navigate to `/b2b-dashboard`

#### Test 2: Timeline Visibility
- Navigate to: `https://cases.zenowethu.co.za/b2b-dashboard`
- Look at the left sidebar
- Should see a "Timeline" section with years/months

#### Test 3: Document Viewing  
- Navigate to any case detail page
- Click the "Documents" tab
- Each document should have:
  - 👁️ **View** button (blue)
  - ⬇️ **Download** button (cyan)

---

## 🔧 Troubleshooting

### Issue: Build Fails with Prisma Error
**Error**: `Unknown binaryTarget native`
**Fix**: Already fixed in commit `74da761`. Ensure Dokploy is pulling latest code.

### Issue: Build Fails with TypeScript Error
**Error**: `Cannot find name 'getProjectFullPath'`
**Fix**: Already fixed in commit `715a98e`. Ensure deployment uses latest commit.

### Issue: Deployment Shows as "Success" but Changes Not Visible
**Possible Causes**:
1. **Browser Cache**: Hard refresh (`Ctrl+Shift+R` or `Cmd+Shift+R`)
2. **CDN Cache**: Wait 2-5 minutes for CDN to update
3. **Old Container Running**: Check Dokploy container logs
4. **Wrong Branch Deployed**: Verify Dokploy is tracking `main` branch

**Fix**:
```bash
# Clear browser cache completely
# Or open incognito/private window to test
```

### Issue: Dokploy Not Detecting New Commits
**Fix**:
1. Check GitHub webhook is active
2. Verify Dokploy has correct repo URL
3. Check Dokploy API tokens haven't expired
4. Manually trigger deployment via UI

---

## 📊 Verification Checklist

After deployment, verify:

- [ ] Logo is clickable on B2B dashboard
- [ ] Timeline shows in sidebar with years/months
- [ ] Documents have "View" buttons
- [ ] Documents have "Download" buttons
- [ ] All case data displays correctly
- [ ] No console errors in browser DevTools
- [ ] Prisma database queries work
- [ ] Authentication works
- [ ] File uploads work

---

## 🎯 Expected Outcome

**Before (Current Live Server)**:
- ❌ Logo not clickable
- ❌ No timeline
- ❌ Documents can't be viewed

**After (Successful Deployment)**:
- ✅ Logo clickable
- ✅ Timeline visible
- ✅ Documents viewable & downloadable
- ✅ Matches localhost exactly

---

## 📝 Additional Notes

### Environment Variables
Ensure these are set in Dokploy:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (should be `https://cases.zenowethu.co.za`)
- `AZURE_STORAGE_*` (for document storage)
- Any other custom variables

### Database Migrations
If schema changed (it didn't in this case), run:
```bash
npx prisma migrate deploy
```

### Container Health Check
Dokploy should show container as "healthy" after deployment.
If container keeps restarting, check logs for errors.

---

## 🆘 Emergency Rollback

If deployment breaks the site:

1. **Via Dokploy**: 
   - Go to Deployments tab
   - Find previous working deployment
   - Click **"Rollback"**

2. **Via Git**:
   ```bash
   git revert HEAD
   git push origin main
   ```

---

## Contact & Support

If issues persist:
1. Check Dokploy logs: `docker logs [container-id]`
2. Check Next.js logs in Dokploy UI
3. Verify DNS settings are correct
4. Test database connectivity

Last Updated: 2026-01-30
