import time
import requests
import json

# Backend API configuration
BACKEND_URL = "http://localhost:5000/api"

def auto_job_application_loop(query="software developer", location="Remote", limit=10, min_match_score=50):
    print(f"🚀 Starting Auto-Apply Bot for '{query}' in '{location}'...")
    
    # 1. Check backend health
    try:
        health = requests.get(f"{BACKEND_URL}/health").json()
        if not health.get("status") == "ok":
            print("❌ Backend is not healthy or offline.")
            return
        print("✅ Backend connection established.")
    except Exception as e:
        print(f"❌ Error connecting to backend at {BACKEND_URL}: {e}")
        return

    # 2. Check profile
    profile = requests.get(f"{BACKEND_URL}/profile").json()
    if not profile.get("setup"):
        print("⚠️ Profile not configured! Please complete your profile at http://localhost:3000/profile first.")
        return
    print(f"👤 Applying for: {profile.get('name')} ({profile.get('currentTitle')})")

    # 3. Search for jobs
    print(f"🔍 Searching jobs matching query: '{query}'...")
    params = {"query": query, "location": location}
    search_res = requests.get(f"{BACKEND_URL}/jobs/search", params=params).json()
    jobs = search_res.get("jobs", [])

    print(f"Found {len(jobs)} jobs. Beginning automated processing...\n")

    applied_count = 0

    for i, job in enumerate(jobs[:limit]):
        job_id = job.get("job_id")
        title = job.get("job_title")
        company = job.get("employer_name")

        print(f"[{i+1}/{min(limit, len(jobs))}] Evaluating: '{title}' at {company}...")

        # 4. Optional: Match job score via Gemini AI
        try:
            match_res = requests.post(f"{BACKEND_URL}/ai/match", json={"job": job}).json()
            score = match_res.get("matchScore", 100)
            level = match_res.get("matchLevel", "N/A")
            print(f"   📊 AI Match Score: {score}/100 ({level})")
            
            if score < min_match_score:
                print(f"   ⏩ Skipping: Match score ({score}) below threshold ({min_match_score}).\n")
                continue
        except Exception as err:
            print(f"   ⚠️ Could not compute AI match score (falling back to auto-apply): {err}")
            score = 100

        # 5. Generate AI Cover Letter & Submit Application
        print(f"   ✍️ Generating custom cover letter via Gemini...")
        cover_letter = ""
        try:
            cl_res = requests.post(f"{BACKEND_URL}/ai/cover-letter", json={"job": job}).json()
            cover_letter = cl_res.get("coverLetter", "")
        except Exception as err:
            print(f"   ⚠️ Could not generate AI cover letter: {err}")

        # Save/apply application to backend tracker
        app_payload = {
            **job,
            "coverLetter": cover_letter,
            "status": "Applied"
        }
        
        apply_res = requests.post(f"{BACKEND_URL}/applications", json=app_payload).json()
        
        if apply_res.get("success"):
            applied_count += 1
            print(f"   🎉 SUCCESS: Automatically applied & recorded in tracker!")
        else:
            print(f"   ❌ Failed to record application.")

        print("-" * 50)
        # Sleep briefly between requests to prevent API rate limiting
        time.sleep(2)

    print(f"\n✨ Automation complete! Automatically applied to {applied_count} jobs.")
    print("Check http://localhost:3000/applications to see all applied jobs & cover letters.")

if __name__ == "__main__":
    # You can customize your job search keywords, location, max jobs, and minimum match score threshold here:
    auto_job_application_loop(
        query="React Developer",
        location="Remote",
        limit=5,
        min_match_score=40
    )
