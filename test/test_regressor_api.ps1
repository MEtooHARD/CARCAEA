# Test script for Valence-Arousal Regressor endpoint
# Uses audio files from ./_aud and saves results to ./res_regr

param(
    [string]$ApiUrl = "http://localhost:5000",
    [string]$AudioDir = "",
    [string]$ResultsDir = ""
)

# Use absolute paths
if ([string]::IsNullOrEmpty($AudioDir)) {
    $AudioDir = Join-Path $PSScriptRoot "_aud"
}
if ([string]::IsNullOrEmpty($ResultsDir)) {
    $ResultsDir = Join-Path $PSScriptRoot "res_regr"
}

# Convert to absolute paths
$AudioDir = (Resolve-Path $AudioDir -ErrorAction SilentlyContinue).Path
if (-not $AudioDir) {
    $AudioDir = Join-Path $PSScriptRoot "_aud"
}

$ResultsDir = (Resolve-Path $ResultsDir -ErrorAction SilentlyContinue).Path
if (-not $ResultsDir) {
    $ResultsDir = Join-Path $PSScriptRoot "res_regr"
}

# Ensure directories exist
if (-not (Test-Path $AudioDir)) {
    New-Item -ItemType Directory -Path $AudioDir -Force | Out-Null
    Write-Host "✓ Created audio directory: $AudioDir"
} else {
    Write-Host "✓ Audio directory found: $AudioDir" -ForegroundColor Green
}

if (-not (Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Path $ResultsDir -Force | Out-Null
    Write-Host "✓ Created results directory: $ResultsDir"
} else {
    Write-Host "✓ Results directory found: $ResultsDir" -ForegroundColor Green
}

# Health check
Write-Host "`n🔍 Checking API health..." -ForegroundColor Cyan

try {
    $health = Invoke-WebRequest -Uri "$ApiUrl/health" -Method Get -ErrorAction Stop
    $healthData = $health.Content | ConvertFrom-Json
    
    Write-Host "✓ API is healthy" -ForegroundColor Green
    Write-Host "  - Status: $($healthData.status)"
    Write-Host "  - Service: $($healthData.service)"
    Write-Host "  - Queue size: $($healthData.queue_size)"
} catch {
    Write-Host "✗ Cannot connect to API at $ApiUrl" -ForegroundColor Red
    Write-Host "  Make sure the container is running: docker compose up"
    exit 1
}

# Find audio files
$audioFiles = @()

# Try with wildcard filter for common audio formats
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.wav" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.mp3" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.flac" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.ogg" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.m4a" -ErrorAction SilentlyContinue)

# Remove duplicates
$audioFiles = $audioFiles | Sort-Object -Unique -Property FullName

if ($audioFiles.Count -eq 0) {
    Write-Host "`n⚠️  No audio files found in $AudioDir" -ForegroundColor Yellow
    Write-Host "   Place .mp3, .wav, .flac, or other audio files there to test"
    exit 0
}

Write-Host "`n🎵 Found $($audioFiles.Count) audio file(s):" -ForegroundColor Cyan
$audioFiles | ForEach-Object {
    Write-Host "   - $($_.Name)"
}

# Process each audio file
$successCount = 0
$failureCount = 0

foreach ($audioFile in $audioFiles) {
    Write-Host "`n$('='*60)" -ForegroundColor White
    Write-Host "Processing: $($audioFile.Name)" -ForegroundColor White
    Write-Host "$('='*60)" -ForegroundColor White
    
    Write-Host "`n🎼 Running regression..." -ForegroundColor Cyan
    Write-Host "   Endpoint: /regress"
    
    try {
        # Create multipart form data using .NET
        $multipartContent = [System.Net.Http.MultipartFormDataContent]::new()
        
        # Add file
        $fileStream = [System.IO.File]::OpenRead($audioFile.FullName)
        $fileContent = [System.Net.Http.StreamContent]::new($fileStream)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
        $multipartContent.Add($fileContent, "file", $audioFile.Name)
        
        # Create HTTP client and send request
        $httpClient = [System.Net.Http.HttpClient]::new()
        $uri = [System.Uri]::new("$ApiUrl/regress")
        
        try {
            $response = $httpClient.PostAsync($uri, $multipartContent).Result
            
            if ($response.StatusCode -ne [System.Net.HttpStatusCode]::OK) {
                throw "HTTP $($response.StatusCode): $($response.Content.ReadAsStringAsync().Result)"
            }
            
            $responseContent = $response.Content.ReadAsStringAsync().Result
            $regressData = $responseContent | ConvertFrom-Json
            
            Write-Host "✓ Regression successful" -ForegroundColor Green
            Write-Host "  - Valence: $($regressData.valence)"
            Write-Host "  - Arousal: $($regressData.arousal)"
            Write-Host "  - Emotion: $($regressData.emotion_quadrant)"
            Write-Host "  - Model: $($regressData.model)"
            
            # Save results
            try {
                $results = @{
                    timestamp = (Get-Date -Format "o")
                    audio_file = $audioFile.Name
                    audio_path = $audioFile.FullName
                    api_url = $ApiUrl
                    valence = $regressData.valence
                    arousal = $regressData.arousal
                    emotion_quadrant = $regressData.emotion_quadrant
                    model = $regressData.model
                    features = $regressData.features
                }
                
                $timestamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
                $safeName = [System.IO.Path]::GetFileNameWithoutExtension($audioFile.Name) -replace '[^\w\s-]', '_'
                $resultFile = Join-Path $ResultsDir "$($safeName)_$timestamp.json"
                
                $results | ConvertTo-Json -Depth 10 | Out-File -FilePath $resultFile -Encoding UTF8
                Write-Host "💾 Results saved: $(Split-Path -Leaf $resultFile)" -ForegroundColor Green
                
                $successCount++
            } catch {
                Write-Host "✗ Failed to save results: $($_.Exception.Message)" -ForegroundColor Red
                $failureCount++
            }
        }
        finally {
            $fileStream.Dispose()
            $fileContent.Dispose()
            $multipartContent.Dispose()
            $httpClient.Dispose()
        }
        
    } catch {
        Write-Host "✗ Regression failed: $($_.Exception.Message)" -ForegroundColor Red
        $failureCount++
    }
}

Write-Host "`n$('='*60)" -ForegroundColor White
Write-Host "✓ Testing complete!" -ForegroundColor Green
Write-Host "  - Successful: $successCount" -ForegroundColor Green
Write-Host "  - Failed: $failureCount" -ForegroundColor $(if ($failureCount -gt 0) { "Red" } else { "Green" })
Write-Host "  - Results directory: $ResultsDir" -ForegroundColor Green
Write-Host "$('='*60)" -ForegroundColor White
