# Migration script to move practical questions to correct directory structure
# Converts from: questions/practical/{number}/{Lesson Name}/
# To: questions/practical/{section-slug}/{lesson-slug}/

$baseDir = "c:\Users\Dyedw\Documents\repos\DSAPrac\questions\practical"

# Find all JSON files
$jsonFiles = Get-ChildItem -Path $baseDir -Recurse -File -Filter "*.json"

Write-Host "Found $($jsonFiles.Count) practical question files to migrate" -ForegroundColor Cyan
Write-Host ""

foreach ($file in $jsonFiles) {
    try {
        # Read the JSON data
        $json = Get-Content $file.FullName -Raw | ConvertFrom-Json
        
        $section = $json.section
        $lesson = $json.lesson
        $id = $json.id
        
        Write-Host "Processing: $id" -ForegroundColor Yellow
        Write-Host "  Current path: $($file.DirectoryName)"
        Write-Host "  Section: $section"
        Write-Host "  Lesson: $lesson"
        
        # Slugify function (simple PowerShell version)
        function Slugify($text) {
            $text = $text.ToLower()
            $text = $text -replace '[^a-z0-9\s-]', ''
            $text = $text -replace '\s+', '-'
            $text = $text -replace '-+', '-'
            $text = $text.Trim('-')
            return $text
        }
        
        # Create slugified paths
        $sectionSlug = Slugify $section
        $lessonSlug = Slugify $lesson
        
        # New directory path
        $newDir = Join-Path $baseDir (Join-Path $sectionSlug $lessonSlug)
        
        Write-Host "  Target path: $newDir" -ForegroundColor Green
        
        # Create new directory if it doesn't exist
        if (!(Test-Path $newDir)) {
            New-Item -ItemType Directory -Path $newDir -Force | Out-Null
            Write-Host "  Created directory: $newDir" -ForegroundColor Green
        }
        
        # Move the JSON file
        $newFilePath = Join-Path $newDir "$id.json"
        if ($file.FullName -ne $newFilePath) {
            Copy-Item -Path $file.FullName -Destination $newFilePath -Force
            Write-Host "  Moved JSON: $($file.Name) -> $newFilePath" -ForegroundColor Green
            
            # Check for image file
            $imageFileName = $json.image
            if ($imageFileName) {
                $oldImagePath = Join-Path $file.DirectoryName $imageFileName
                if (Test-Path $oldImagePath) {
                    $newImagePath = Join-Path $newDir $imageFileName
                    Copy-Item -Path $oldImagePath -Destination $newImagePath -Force
                    Write-Host "  Moved image: $imageFileName" -ForegroundColor Green
                }
            }
            
            # Remove old file
            Remove-Item -Path $file.FullName -Force
            Write-Host "  Deleted old JSON file" -ForegroundColor Gray
            
            # Try to remove old directory if empty
            $oldDir = $file.DirectoryName
            $remainingFiles = Get-ChildItem -Path $oldDir
            if ($remainingFiles.Count -eq 0) {
                Remove-Item -Path $oldDir -Force
                Write-Host "  Removed empty directory: $oldDir" -ForegroundColor Gray
                
                # Try to remove parent directory if empty
                $parentDir = Split-Path $oldDir -Parent
                $parentFiles = Get-ChildItem -Path $parentDir
                if ($parentFiles.Count -eq 0 -and $parentDir -ne $baseDir) {
                    Remove-Item -Path $parentDir -Force
                    Write-Host "  Removed empty parent directory: $parentDir" -ForegroundColor Gray
                }
            }
        } else {
            Write-Host "  Already in correct location" -ForegroundColor Cyan
        }
        
        Write-Host ""
        
    } catch {
        Write-Host "ERROR processing $($file.FullName): $_" -ForegroundColor Red
        Write-Host ""
    }
}

Write-Host "Migration complete!" -ForegroundColor Green
