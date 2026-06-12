param(
  [string]$BaseUrl = 'http://localhost:5420',
  [switch]$LiveOpenAITest
)

$ErrorActionPreference = 'Stop'

$BaseUrl = $BaseUrl.TrimEnd('/')
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Write-Step([string]$Message) {
  Write-Output "[verify] $Message"
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Invoke-Json(
  [string]$Path,
  [string]$Method = 'GET',
  [object]$Body = $null,
  [int]$ExpectedStatus = 200,
  [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession = $null
) {
  $request = @{
    Uri             = "$BaseUrl$Path"
    Method          = $Method
    UseBasicParsing = $true
    TimeoutSec      = 180
  }

  if ($WebSession) {
    $request.WebSession = $WebSession
  }

  if ($null -ne $Body) {
    $request.ContentType = 'application/json'
    $request.Body = ($Body | ConvertTo-Json -Compress)
  }

  try {
    $response = Invoke-WebRequest @request
    $status = [int]$response.StatusCode
    $content = $response.Content
  } catch {
    if (-not $_.Exception.Response) {
      throw
    }
    $response = $_.Exception.Response
    $status = [int]$response.StatusCode
    $content = $_.ErrorDetails.Message
    if (-not $content) {
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $content = $reader.ReadToEnd()
    }
  }

  Assert-True ($status -eq $ExpectedStatus) "Expected $Method $Path to return $ExpectedStatus, got $status. Body: $content"
  if (-not $content) {
    return [PSCustomObject]@{}
  }
  return $content | ConvertFrom-Json
}

Write-Step "checking app shell"
$homeResponse = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec 30
Assert-True ([int]$homeResponse.StatusCode -eq 200) "Expected / to return 200"

$agentPage = Invoke-WebRequest -Uri "$BaseUrl/ai-canvas-agent" -UseBasicParsing -TimeoutSec 30
Assert-True ([int]$agentPage.StatusCode -eq 200) "Expected /ai-canvas-agent to return 200"

Write-Step "checking auth session starts empty"
$initialSession = Invoke-Json -Path '/api/auth/session' -WebSession $session
Assert-True ($null -eq $initialSession.user) 'Expected unauthenticated session before login'

Write-Step "checking register/login/session/logout"
$email = 'local-smoke@example.local'
$password = 'canvas123'
$name = 'Local Smoke Tester'
$registeredOrLoggedIn = $false

try {
  $register = Invoke-Json -Path '/api/auth/register' -Method 'POST' -Body @{
    name = $name
    email = $email
    password = $password
  } -WebSession $session
  Assert-True ($register.user.email -eq $email) 'Registered user email did not match'
  $registeredOrLoggedIn = $true
} catch {
  if ($_.Exception.Message -match '409') {
    $login = Invoke-Json -Path '/api/auth/login' -Method 'POST' -Body @{
      email = $email
      password = $password
    } -WebSession $session
    Assert-True ($login.user.email -eq $email) 'Logged-in user email did not match'
    $registeredOrLoggedIn = $true
  } else {
    try {
      $login = Invoke-Json -Path '/api/auth/login' -Method 'POST' -Body @{
        email = $email
        password = $password
      } -WebSession $session
      Assert-True ($login.user.email -eq $email) 'Logged-in user email did not match'
      $registeredOrLoggedIn = $true
    } catch {
      $fallbackEmail = "local-smoke-$(Get-Date -Format yyyyMMddHHmmss)@example.local"
      $register = Invoke-Json -Path '/api/auth/register' -Method 'POST' -Body @{
        name = $name
        email = $fallbackEmail
        password = $password
      } -WebSession $session
      Assert-True ($register.user.email -eq $fallbackEmail) 'Fallback registered user email did not match'
      $email = $fallbackEmail
      $registeredOrLoggedIn = $true
    }
  }
}

Assert-True $registeredOrLoggedIn 'Expected auth flow to register or log in'
$authedSession = Invoke-Json -Path '/api/auth/session' -WebSession $session
Assert-True ($authedSession.user.email -eq $email) 'Expected session user after login'

$logout = Invoke-Json -Path '/api/auth/logout' -Method 'POST' -Body @{} -WebSession $session
Assert-True ($null -eq $logout.user) 'Expected logout response to clear user'

$afterLogout = Invoke-Json -Path '/api/auth/session' -WebSession $session
Assert-True ($null -eq $afterLogout.user) 'Expected empty session after logout'

Write-Step "checking image API status"
$aiStatus = Invoke-Json -Path '/api/ai-status'
Assert-True ($aiStatus.provider -eq 'OpenAI-compatible') 'Expected OpenAI-compatible provider in API status'
Assert-True ([string]::IsNullOrWhiteSpace($aiStatus.baseUrl) -eq $false) 'Expected image API status to include baseUrl'

Write-Step "checking API settings validation"
$invalidSettings = Invoke-Json -Path '/api/ai-key' -Method 'POST' -Body @{
  apiKey = 'sk-local-verification-placeholder'
  baseUrl = 'not-a-url'
} -ExpectedStatus 400
Assert-True ($invalidSettings.error -match 'base URL') 'Expected invalid base URL to be rejected'

if (-not $aiStatus.configured) {
  Write-Step 'IMAGE_API_KEY is not configured; checking image API endpoint fails clearly'
  $missingImage = Invoke-Json -Path '/api/generate-image' -Method 'POST' -Body @{
    prompt = 'A simple verification image of connected design cards'
    model = 'gpt-image-2'
    size = '1024x1024'
  } -ExpectedStatus 503
  Assert-True ($missingImage.error -match 'IMAGE_API_KEY') 'Expected missing key error for image generation'
} elseif ($LiveOpenAITest) {
  Write-Step "IMAGE_API_KEY is configured for $($aiStatus.baseUrl); checking image model discovery"
  $models = Invoke-Json -Path '/api/ai-models'
  Assert-True (@($models.imageModels).Count -gt 0) 'Expected at least one image model from gateway discovery'

  $imageModel = @($models.imageModels)[0].id

  Write-Step "running live gateway checks with image model $imageModel"
  $image = Invoke-Json -Path '/api/generate-image' -Method 'POST' -Body @{
    prompt = 'A simple verification image of connected design cards'
    model = $imageModel
    size = '1024x1024'
  }
  Assert-True (($image.imageUrl -match '^data:image/' -or $image.imageUrl -match '^https?://')) 'Expected generated image URL'

  $editedImage = Invoke-Json -Path '/api/generate-image' -Method 'POST' -Body @{
    prompt = 'Create a clean monochrome variation of this verification image'
    model = $imageModel
    size = '1024x1024'
    sourceImageUrl = $image.imageUrl
  }
  Assert-True (($editedImage.imageUrl -match '^data:image/' -or $editedImage.imageUrl -match '^https?://')) 'Expected edited image URL'
} else {
  Write-Step "IMAGE_API_KEY is configured for $($aiStatus.baseUrl); live gateway calls skipped. Re-run with -LiveOpenAITest to verify paid image API calls."
}

Write-Step 'local system verification passed'
