# Test script for Essentia API using PowerShell
# Place audio files in ./audio_samples/ and run this script

param(
    [string]$ApiUrl = "http://localhost:5000",
    [string]$AudioDir = "",
    [string]$ResultsDir = ""
)

# Use absolute paths
if ([string]::IsNullOrEmpty($AudioDir)) {
    $AudioDir = Join-Path $PSScriptRoot "audio_samples"
}
if ([string]::IsNullOrEmpty($ResultsDir)) {
    $ResultsDir = Join-Path $PSScriptRoot "results"
}

# Convert to absolute paths
$AudioDir = (Resolve-Path $AudioDir -ErrorAction SilentlyContinue).Path
if (-not $AudioDir) {
    $AudioDir = Join-Path $PSScriptRoot "audio_samples"
}

$ResultsDir = (Resolve-Path $ResultsDir -ErrorAction SilentlyContinue).Path
if (-not $ResultsDir) {
    $ResultsDir = Join-Path $PSScriptRoot "results"
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
    Write-Host "  - Extractors: $($healthData.extractors)"
    Write-Host "  - Classifiers: $($healthData.classifiers)"
} catch {
    Write-Host "✗ Cannot connect to API at $ApiUrl" -ForegroundColor Red
    Write-Host "  Make sure the container is running: docker compose up"
    exit 1
}

# List available operations
Write-Host "`n📋 Available operations:" -ForegroundColor Cyan

try {
    $models = Invoke-WebRequest -Uri "$ApiUrl/models" -Method Get -ErrorAction Stop
    $modelsData = $models.Content | ConvertFrom-Json
    
    Write-Host "  Extractors: $($modelsData.extractors -join ', ')"
    Write-Host "  Classifiers: $($modelsData.classifiers -join ', ')"
} catch {
    Write-Host "✗ Failed to list operations" -ForegroundColor Red
}

# Find audio files - try multiple approaches
$audioFiles = @()

# Try with wildcard filter
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.wav" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.mp3" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.flac" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.ogg" -ErrorAction SilentlyContinue)
$audioFiles += @(Get-ChildItem -Path $AudioDir -Filter "*.m4a" -ErrorAction SilentlyContinue)

# Remove duplicates
$audioFiles = $audioFiles | Sort-Object -Unique -Property FullName

if ($audioFiles.Count -eq 0) {
    Write-Host "`n⚠️  No audio files found in $AudioDir" -ForegroundColor Yellow
    Write-Host "   Checking directory contents:" -ForegroundColor Yellow
    Get-ChildItem -Path $AudioDir | ForEach-Object {
        Write-Host "   - $($_.Name) ($($_.Extension))"
    }
    Write-Host "   Place .mp3, .wav, or other audio files there to test"
    exit 0
}

Write-Host "`n🎵 Found $($audioFiles.Count) audio file(s):" -ForegroundColor Cyan
$audioFiles | ForEach-Object {
    Write-Host "   - $($_.Name)"
}

# Process each audio file
foreach ($audioFile in $audioFiles) {
    Write-Host "`n$('='*60)" -ForegroundColor White
    Write-Host "Testing: $($audioFile.Name)" -ForegroundColor White
    Write-Host "$('='*60)" -ForegroundColor White
    
    # Extract embedding
    Write-Host "`n📊 Extracting embedding..." -ForegroundColor Cyan
    Write-Host "   Operation: msd-musicnn-1"
    
    try {
        # Create multipart form data using .NET
        $multipartContent = [System.Net.Http.MultipartFormDataContent]::new()
        $boundary = $multipartContent.Headers.ContentType.Parameters['boundary']
        
        # Add file
        $fileStream = [System.IO.File]::OpenRead($audioFile.FullName)
        $fileContent = [System.Net.Http.StreamContent]::new($fileStream)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
        $multipartContent.Add($fileContent, "file", $audioFile.Name)
        
        # Add operation parameter
        $operationContent = [System.Net.Http.StringContent]::new("msd-musicnn-1")
        $multipartContent.Add($operationContent, "operation")
        
        # Create HTTP client and send request
        $httpClient = [System.Net.Http.HttpClient]::new()
        $uri = [System.Uri]::new("$ApiUrl/extract")
        
        try {
            $response = $httpClient.PostAsync($uri, $multipartContent).Result
            
            if ($response.StatusCode -ne [System.Net.HttpStatusCode]::OK) {
                throw "HTTP $($response.StatusCode): $($response.Content.ReadAsStringAsync().Result)"
            }
            
            $responseContent = $response.Content.ReadAsStringAsync().Result
            $extractData = $responseContent | ConvertFrom-Json
            
            Write-Host "✓ Extraction successful" -ForegroundColor Green
            Write-Host "  - Embedding shape: $($extractData.shape)"
            Write-Host "  - Embedding length: $($extractData.embedding.Count)"
            
            $embedding = $extractData.embedding
        }
        finally {
            $fileStream.Dispose()
            $fileContent.Dispose()
            $operationContent.Dispose()
            $multipartContent.Dispose()
            $httpClient.Dispose()
        }
        
        # Classify embedding
        Write-Host "`n📊 Classifying embedding..." -ForegroundColor Cyan
        Write-Host "   Operation: emomusic-msd-musicnn-2"
        
        $classifyData = $null
        try {
            $classifyBody = @{
                embedding = @($embedding)  # Ensure it's an array
                operation = "emomusic-msd-musicnn-2"
            } | ConvertTo-Json -Depth 10
            
            $classifyResponse = Invoke-WebRequest `
                -Uri "$ApiUrl/classify" `
                -Method Post `
                -ContentType "application/json" `
                -Body $classifyBody `
                -ErrorAction Stop
            
            $classifyData = $classifyResponse.Content | ConvertFrom-Json
            
            Write-Host "✓ Classification successful" -ForegroundColor Green
            Write-Host "  - Predictions shape: $($classifyData.shape)"
            Write-Host "  - Predictions length: $($classifyData.predictions.Count)"
            
        } catch {
            Write-Host "✗ Classification failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Save results (extraction + classification attempt)
        try {
            $results = @{
                timestamp = (Get-Date -Format "o")
                audio_file = $audioFile.Name
                api_url = $ApiUrl
                extraction = $extractData
                classification = $classifyData
            }
            
            $timestamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
            $safeName = [System.IO.Path]::GetFileNameWithoutExtension($audioFile.Name) -replace '[^\w\s-]', '_'
            $resultFile = Join-Path $ResultsDir "$($safeName)_$timestamp.json"
            
            $results | ConvertTo-Json -Depth 10 | Out-File -FilePath $resultFile -Encoding UTF8
            Write-Host "`n💾 Results saved: $resultFile" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to save results: $($_.Exception.Message)" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "✗ Extraction failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n✓ Testing complete!" -ForegroundColor Green
Write-Host "  Results stored in: $ResultsDir"
