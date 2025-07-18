#!/bin/bash

set -o pipefail

readonly __DIRNAME__="$( cd "${BASH_SOURCE[0]%/*}" && pwd )"
readonly REPO_ROOT_DIR="$(dirname "${__DIRNAME__}")"

PLATFORM=$1
MODE=$2
TARGET=$3
RUN_DEVICE=false
PRE_RELEASE=false
JS_ENV_FILE=".js.env"
ANDROID_ENV_FILE=".android.env"
IOS_ENV_FILE=".ios.env"

envFileMissing() {
	FILE="$1"
	echo "'$FILE' is missing, you'll need to add it to the root of the project."
	echo "For convenience you can rename '$FILE.example' and fill in the parameters."
	echo ""
	exit 1
}

displayHelp() {
	echo ''
	echo "Usage: $0 {platform} ${--device}" >&2
	echo ''
	echo "Platform is required. Can be android or ios"
	echo ''
	echo "Mode is required. Can be debug or release"
	echo ''
	echo "Target is optional and valid for iOS only"
	echo ''
	echo "examples: $0 ios debug"
	echo ''
	echo "          $0 ios debug --device"
	echo ''
	echo "          $0 android debug"
	echo ''
	echo "          $0 android release"
	echo ''
	exit 1
}

printTitle(){
	echo ''
	echo '-------------------------------------------'
	echo ''
	echo "  🚀 BUILDING $PLATFORM in $MODE mode $TARGET" | tr [a-z] [A-Z]
	echo ''
	echo '-------------------------------------------'
	echo ''
}


printError(){
	ERROR_ICON=$'\342\235\214'
	echo ''
	echo "  $ERROR_ICON   $1"
	echo ''
}

checkParameters(){
	if [ "$#" -eq  "0" ]
	then
		printError 'Platform is a required parameter'
		displayHelp
		exit 0;
	elif [ "$1"  == "--help" ]
	then
		displayHelp
		exit 0;
	elif [ "$1" == "-h" ]
	then
		displayHelp
		exit 0;
	elif [ -z "$1" ]
	then
		displayHelp
		exit 0;
	elif [ -z "$1" ]
	then
		printError 'No platform supplied'
		displayHelp
		exit 0;
	fi

	if [[ $# -gt 2 ]] ; then
		if [ "$3"  == "--device" ] ; then
			RUN_DEVICE=true

		   if [ "$#" -gt  "3" ] ; then
				printError "Incorrect number of arguments"
				displayHelp
				exit 0;
			fi
		elif [ "$3"  == "--pre" ] ; then
			PRE_RELEASE=true
		fi
	fi
}

remapEnvVariable() {
    # Get the old and new variable names
    old_var_name=$1
    new_var_name=$2

    # Check if the old variable exists
    if [ -z "${!old_var_name}" ]; then
        echo "Error: $old_var_name does not exist in the environment."
        return 1
    fi

    # Remap the variable
    export $new_var_name="${!old_var_name}"

    unset $old_var_name

    echo "Successfully remapped $old_var_name to $new_var_name."
}

remapEnvVariableLocal() {
  	echo "Remapping local env variables for development"
  	remapEnvVariable "MM_SENTRY_DSN_DEV" "MM_SENTRY_DSN"
}

remapEnvVariableQA() {
  	echo "Remapping QA env variable names to match QA values"
  	remapEnvVariable "SEGMENT_WRITE_KEY_QA" "SEGMENT_WRITE_KEY"
  	remapEnvVariable "SEGMENT_PROXY_URL_QA" "SEGMENT_PROXY_URL"
  	remapEnvVariable "SEGMENT_DELETE_API_SOURCE_ID_QA" "SEGMENT_DELETE_API_SOURCE_ID"
  	remapEnvVariable "SEGMENT_REGULATIONS_ENDPOINT_QA" "SEGMENT_REGULATIONS_ENDPOINT"
  	remapEnvVariable "MM_SENTRY_DSN_TEST" "MM_SENTRY_DSN"
	remapEnvVariable "MAIN_WEB3AUTH_NETWORK_UAT" "WEB3AUTH_NETWORK"
}

remapEnvVariableRelease() {
  	echo "Remapping release env variable names to match production values"
  	remapEnvVariable "SEGMENT_WRITE_KEY_PROD" "SEGMENT_WRITE_KEY"
  	remapEnvVariable "SEGMENT_PROXY_URL_PROD" "SEGMENT_PROXY_URL"
  	remapEnvVariable "SEGMENT_DELETE_API_SOURCE_ID_PROD" "SEGMENT_DELETE_API_SOURCE_ID"
  	remapEnvVariable "SEGMENT_REGULATIONS_ENDPOINT_PROD" "SEGMENT_REGULATIONS_ENDPOINT"
	remapEnvVariable "MAIN_WEB3AUTH_NETWORK_PROD" "WEB3AUTH_NETWORK"
}

remapFlaskEnvVariables() {
  	echo "Remapping Flask env variable names to match Flask values"
  	remapEnvVariable "SEGMENT_WRITE_KEY_FLASK" "SEGMENT_WRITE_KEY"
  	remapEnvVariable "SEGMENT_PROXY_URL_FLASK" "SEGMENT_PROXY_URL"
  	remapEnvVariable "SEGMENT_DELETE_API_SOURCE_ID_FLASK" "SEGMENT_DELETE_API_SOURCE_ID"
  	remapEnvVariable "SEGMENT_REGULATIONS_ENDPOINT_FLASK" "SEGMENT_REGULATIONS_ENDPOINT"
	remapEnvVariable "FLASK_WEB3AUTH_NETWORK_PROD" "WEB3AUTH_NETWORK"
}

remapEnvVariableProduction() {
  	echo "Remapping Production env variable names to match Production values"
  	remapEnvVariable "SEGMENT_WRITE_KEY_PROD" "SEGMENT_WRITE_KEY"
    remapEnvVariable "SEGMENT_PROXY_URL_PROD" "SEGMENT_PROXY_URL"
    remapEnvVariable "SEGMENT_DELETE_API_SOURCE_ID_PROD" "SEGMENT_DELETE_API_SOURCE_ID"
    remapEnvVariable "SEGMENT_REGULATIONS_ENDPOINT_PROD" "SEGMENT_REGULATIONS_ENDPOINT"
	remapEnvVariable "MAIN_WEB3AUTH_NETWORK_PROD" "WEB3AUTH_NETWORK"
}

remapEnvVariableBeta() {
  	echo "Remapping Beta env variable names to match Beta values"
  	remapEnvVariable "SEGMENT_WRITE_KEY_PROD" "SEGMENT_WRITE_KEY"
    remapEnvVariable "SEGMENT_PROXY_URL_PROD" "SEGMENT_PROXY_URL"
    remapEnvVariable "SEGMENT_DELETE_API_SOURCE_ID_PROD" "SEGMENT_DELETE_API_SOURCE_ID"
    remapEnvVariable "SEGMENT_REGULATIONS_ENDPOINT_PROD" "SEGMENT_REGULATIONS_ENDPOINT"
	remapEnvVariable "MAIN_WEB3AUTH_NETWORK_PROD" "WEB3AUTH_NETWORK"
}

remapEnvVariableReleaseCandidate() {
  	echo "Remapping Release Candidate env variable names to match Release Candidate values"
  	remapEnvVariable "SEGMENT_WRITE_KEY_PROD" "SEGMENT_WRITE_KEY"
    remapEnvVariable "SEGMENT_PROXY_URL_PROD" "SEGMENT_PROXY_URL"
    remapEnvVariable "SEGMENT_DELETE_API_SOURCE_ID_PROD" "SEGMENT_DELETE_API_SOURCE_ID"
    remapEnvVariable "SEGMENT_REGULATIONS_ENDPOINT_PROD" "SEGMENT_REGULATIONS_ENDPOINT"
	remapEnvVariable "MAIN_WEB3AUTH_NETWORK_PROD" "WEB3AUTH_NETWORK"
}

loadJSEnv(){
	# Load JS specific env variables
	if [ "$PRE_RELEASE" = false ] ; then
		if [ -e $JS_ENV_FILE ]
		then
			source $JS_ENV_FILE
		fi
	fi
	# Disable auto Sentry file upload by default
	export SENTRY_DISABLE_AUTO_UPLOAD=${SENTRY_DISABLE_AUTO_UPLOAD:-"true"}
	export EXPO_NO_TYPESCRIPT_SETUP=1
}


prebuild(){
  WATCHER_PORT=${WATCHER_PORT:-8081}
}

prebuild_ios(){
	prebuild
	# Generate xcconfig files for CircleCI
	if [ "$PRE_RELEASE" = true ] ; then
		echo "" > ios/debug.xcconfig
		echo "" > ios/release.xcconfig
	fi
	# Required to install mixpanel dep
	git submodule update --init --recursive
	unset PREFIX
  # Create GoogleService-Info.plist file to be used by the Firebase services.
  # Check if GOOGLE_SERVICES_B64_IOS is set
  if [ ! -z "$GOOGLE_SERVICES_B64_IOS" ]; then
    echo -n $GOOGLE_SERVICES_B64_IOS | base64 -d > ./ios/GoogleServices/GoogleService-Info.plist
    echo "GoogleService-Info.plist has been created successfully."
    # Ensure the file has read and write permissions
    chmod 664 ./ios/GoogleServices/GoogleService-Info.plist
  else
    echo "GOOGLE_SERVICES_B64_IOS is not set in the .env file."
    exit 1
  fi
}

prebuild_android(){
	prebuild
	# Copy JS files for injection
	yes | cp -rf app/core/InpageBridgeWeb3.js android/app/src/main/assets/.
	# Copy fonts with iconset
	yes | cp -rf ./app/fonts/Metamask.ttf ./android/app/src/main/assets/fonts/Metamask.ttf

  #Create google-services.json file to be used by the Firebase services.
  # Check if GOOGLE_SERVICES_B64_ANDROID is set
  if [ ! -z "$GOOGLE_SERVICES_B64_ANDROID" ]; then
    echo -n $GOOGLE_SERVICES_B64_ANDROID | base64 -d > ./android/app/google-services.json
    echo "google-services.json has been created successfully."
    # Ensure the file has read and write permissions
    chmod 664 ./android/app/google-services.json
  else
    echo "GOOGLE_SERVICES_B64_ANDROID is not set in the .env file."
    exit 1
  fi

	if [ "$PRE_RELEASE" = false ] ; then
		if [ -e $ANDROID_ENV_FILE ]
		then
			source $ANDROID_ENV_FILE
		fi
	fi
}

buildAndroidRun(){
	remapEnvVariableLocal
	prebuild_android
	#react-native run-android --port=$WATCHER_PORT --variant=prodDebug --active-arch-only
	npx expo run:android --no-install --port $WATCHER_PORT --variant 'prodDebug' --device
}

buildAndroidDevBuild(){
	prebuild_android
	if [ -e $ANDROID_ENV_FILE ]
	then
		source $ANDROID_ENV_FILE
	fi
	cd android && ./gradlew assembleProdDebug assembleProdDebugAndroidTest -DtestBuildType=debug --build-cache --parallel && cd ..
}

buildAndroidRunQA(){
	remapEnvVariableLocal
	prebuild_android
	#react-native run-android --port=$WATCHER_PORT --variant=qaDebug --active-arch-only
	npx expo run:android --no-install --port $WATCHER_PORT --variant 'qaDebug'
}

buildAndroidRunFlask(){
	prebuild_android
	#react-native run-android --port=$WATCHER_PORT --variant=flaskDebug --active-arch-only
	npx expo run:android --no-install  --port $WATCHER_PORT --variant 'flaskDebug'
}

buildIosDevBuild(){
	remapEnvVariableLocal
	prebuild_ios


	echo "Setting up env vars...";
	echo "$IOS_ENV" | tr "|" "\n" > $IOS_ENV_FILE
	echo "Build started..."
	brew install watchman
	cd ios

	exportOptionsPlist="MetaMask/IosExportOptionsMetaMaskDevelopment.plist"
	scheme="MetaMask"

	echo "exportOptionsPlist: $exportOptionsPlist"
  	echo "Generating archive packages for $scheme"
	xcodebuild -workspace MetaMask.xcworkspace -scheme $scheme -configuration Debug COMIPLER_INDEX_STORE_ENABLE=NO archive -archivePath build/$scheme.xcarchive -destination generic/platform=ios
	echo "Generating ipa for $scheme"
	xcodebuild -exportArchive -archivePath build/$scheme.xcarchive -exportPath build/output -exportOptionsPlist $exportOptionsPlist
	cd ..
}

buildIosSimulator(){
	remapEnvVariableLocal
	prebuild_ios
	if [ -n "$IOS_SIMULATOR" ]; then
		SIM_OPTION="--device \"$IOS_SIMULATOR\""
	else
		SIM_OPTION=""
	fi
	#react-native run-ios --port=$WATCHER_PORT $SIM_OPTION
	npx expo run:ios --no-install --configuration Debug --port $WATCHER_PORT $SIM_OPTION
}

buildIosSimulatorQA(){
	prebuild_ios
	SIM="${IOS_SIMULATOR:-"iPhone 13 Pro"}"
	#react-native run-ios --port=$WATCHER_PORT --simulator "$SIM" --scheme "MetaMask-QA"

	npx expo run:ios --no-install --configuration Debug --port $WATCHER_PORT --device "$SIM" --scheme "MetaMask-QA"
}

buildIosSimulatorFlask(){
	prebuild_ios
	SIM="${IOS_SIMULATOR:-"iPhone 13 Pro"}"
	npx expo run:ios --no-install --configuration Debug --port $WATCHER_PORT --device "$SIM" --scheme "MetaMask-Flask"
}

buildIosSimulatorE2E(){
	prebuild_ios
	cd ios && CC=clang CXX=clang CLANG=clang CLANGPLUSPLUS=clang++ LD=clang LDPLUSPLUS=clang++ xcodebuild -workspace MetaMask.xcworkspace -scheme MetaMask -configuration Debug -sdk iphonesimulator -derivedDataPath build
}

buildIosFlaskSimulatorE2E(){
	prebuild_ios
	cd ios && CC=clang CXX=clang CLANG=clang CLANGPLUSPLUS=clang++ LD=clang LDPLUSPLUS=clang++ xcodebuild -workspace MetaMask.xcworkspace -scheme MetaMask-Flask -configuration Debug -sdk iphonesimulator -derivedDataPath build
}

buildIosQASimulatorE2E(){
	prebuild_ios
	cd ios && xcodebuild -workspace MetaMask.xcworkspace -scheme MetaMask-QA -configuration Debug -sdk iphonesimulator -derivedDataPath build
}

runIosE2E(){
  cd e2e && yarn ios:debug
}

buildIosDevice(){
	remapEnvVariableLocal
	prebuild_ios
	npx expo run:ios --no-install --configuration Debug --port $WATCHER_PORT --device
}

buildIosDeviceQA(){
	prebuild_ios
	npx expo run:ios --no-install --port $WATCHER_PORT --configuration Debug --scheme "MetaMask-QA" --device
}

buildIosDeviceFlask(){
	prebuild_ios
	npx expo run:ios --no-install --configuration Debug --scheme "MetaMask-Flask" --device
}

generateArchivePackages() {
  scheme="$1"

  if [ "$scheme" = "MetaMask-QA" ] ; then
    exportOptionsPlist="MetaMask/IosExportOptionsMetaMaskQARelease.plist"
  elif [ "$scheme" = "MetaMask-Flask" ] ; then
    exportOptionsPlist="MetaMask/IosExportOptionsMetaMaskFlaskRelease.plist"
  else
    exportOptionsPlist="MetaMask/IosExportOptionsMetaMaskRelease.plist"
  fi

  echo "exportOptionsPlist: $exportOptionsPlist"
  echo "Generating archive packages for $scheme"
	xcodebuild -workspace MetaMask.xcworkspace -scheme $scheme -configuration Release COMIPLER_INDEX_STORE_ENABLE=NO archive -archivePath build/$scheme.xcarchive -destination generic/platform=ios
  echo "Generating ipa for $scheme"
  xcodebuild -exportArchive -archivePath build/$scheme.xcarchive -exportPath build/output -exportOptionsPlist $exportOptionsPlist
}

buildIosRelease(){
  if [ "$MODE" != "main" ]; then
    # For main Mode variables are already remapped
  	remapEnvVariableRelease
  fi

	# Enable Sentry to auto upload source maps and debug symbols
	export SENTRY_DISABLE_AUTO_UPLOAD=${SENTRY_DISABLE_AUTO_UPLOAD:-"true"}

	prebuild_ios

	# Replace release.xcconfig with ENV vars
	if [ "$PRE_RELEASE" = true ] ; then
		echo "Setting up env vars...";
		echo "$IOS_ENV" | tr "|" "\n" > $IOS_ENV_FILE
		echo "Build started..."
		brew install watchman
		cd ios
		generateArchivePackages "MetaMask"
	else
		if [ ! -f "ios/release.xcconfig" ] ; then
			echo "$IOS_ENV" | tr "|" "\n" > ios/release.xcconfig
		fi
		./node_modules/.bin/react-native run-ios --configuration Release --simulator "iPhone 13 Pro"
	fi
}

buildIosFlaskRelease(){
	# remap flask env variables to match what the app expects
	remapFlaskEnvVariables

	prebuild_ios

	# Replace release.xcconfig with ENV vars
	if [ "$PRE_RELEASE" = true ] ; then
		echo "Setting up env vars...";
		echo "$IOS_ENV" | tr "|" "\n" > $IOS_ENV_FILE
		echo "Build started..."
		brew install watchman
		cd ios
		generateArchivePackages "MetaMask-Flask"
	else
		if [ ! -f "ios/release.xcconfig" ] ; then
			echo "$IOS_ENV" | tr "|" "\n" > ios/release.xcconfig
		fi
		./node_modules/.bin/react-native run-ios --scheme "MetaMask-Flask"  --configuration Release --simulator "iPhone 13 Pro"
	fi
}

buildIosReleaseE2E(){
	prebuild_ios

	# Replace release.xcconfig with ENV vars
	if [ "$PRE_RELEASE" = true ] ; then
		echo "Setting up env vars...";
		echo "$IOS_ENV" | tr "|" "\n" > $IOS_ENV_FILE
		echo "Pre-release E2E Build started..."
		brew install watchman
		cd ios
		generateArchivePackages "MetaMask"
	else
		echo "Release E2E Build started..."
		if [ ! -f "ios/release.xcconfig" ] ; then
			echo "$IOS_ENV" | tr "|" "\n" > ios/release.xcconfig
		fi
		cd ios && xcodebuild -workspace MetaMask.xcworkspace -scheme MetaMask -configuration Release -sdk iphonesimulator -derivedDataPath build
	fi
}

buildIosQA(){
  	echo "Start iOS QA build..."

  	remapEnvVariableQA

	prebuild_ios

	# Replace release.xcconfig with ENV vars
	if [ "$PRE_RELEASE" = true ] ; then
		echo "Setting up env vars...";
    	echo "$IOS_ENV"
		echo "$IOS_ENV" | tr "|" "\n" > $IOS_ENV_FILE
		echo "Build started..."
		brew install watchman
		cd ios
		generateArchivePackages "MetaMask-QA"
	else
		if [ ! -f "ios/release.xcconfig" ] ; then
			echo "$IOS_ENV" | tr "|" "\n" > ios/release.xcconfig
		fi
		cd ios && xcodebuild -workspace MetaMask.xcworkspace -scheme MetaMask-QA -configuration Release -sdk iphonesimulator -derivedDataPath build
		# ./node_modules/.bin/react-native run-ios --scheme MetaMask-QA- -configuration Release --simulator "iPhone 13 Pro"
	fi
}


buildAndroidQA(){
	echo "Start Android QA build..."

  	remapEnvVariableQA

	# if [ "$PRE_RELEASE" = false ] ; then
	# 	adb uninstall io.metamask.qa
	# fi

	prebuild_android

	# Generate APK
	cd android && ./gradlew assembleQaRelease app:assembleQaReleaseAndroidTest -PminSdkVersion=26 -DtestBuildType=release

	# GENERATE BUNDLE
	if [ "$GENERATE_BUNDLE" = true ] ; then
		./gradlew bundleQaRelease
	fi

	if [ "$PRE_RELEASE" = true ] ; then
		# Generate checksum
		yarn build:android:checksum:qa
	fi

	#  if [ "$PRE_RELEASE" = false ] ; then
	#  	adb install app/build/outputs/apk/qa/release/app-qa-release.apk
	#  fi
}

buildAndroidRelease(){
    if [ "$MODE" != "main" ]; then
      # For main Mode variables are already remapped
    	remapEnvVariableRelease
    fi

	if [ "$PRE_RELEASE" = false ] ; then
		adb uninstall io.metamask || true
	fi

	# Enable Sentry to auto upload source maps and debug symbols
	export SENTRY_DISABLE_AUTO_UPLOAD=${SENTRY_DISABLE_AUTO_UPLOAD:-"true"}
	prebuild_android

	# GENERATE APK
	cd android && ./gradlew assembleProdRelease --no-daemon --max-workers 2

	# GENERATE BUNDLE
	if [ "$GENERATE_BUNDLE" = true ] ; then
		./gradlew bundleProdRelease
	fi

	if [ "$PRE_RELEASE" = true ] ; then
		# Generate checksum
		yarn build:android:checksum
	fi

	if [ "$PRE_RELEASE" = false ] ; then
		adb install app/build/outputs/apk/prod/release/app-prod-release.apk
	fi
}

buildAndroidFlaskRelease(){
	# remap flask env variables to match what the app expects
	remapFlaskEnvVariables

	if [ "$PRE_RELEASE" = false ] ; then
		adb uninstall io.metamask.flask || true
	fi
	prebuild_android

	# GENERATE APK
	cd android && ./gradlew assembleFlaskRelease --no-daemon --max-workers 2

	# GENERATE BUNDLE
	if [ "$GENERATE_BUNDLE" = true ] ; then
		./gradlew bundleFlaskRelease
	fi

	if [ "$PRE_RELEASE" = true ] ; then
		# Generate checksum
		yarn build:android:checksum:flask
	fi

	if [ "$PRE_RELEASE" = false ] ; then
		adb install app/build/outputs/apk/flask/release/app-flask-release.apk
	fi
}

buildAndroidReleaseE2E(){
	prebuild_android
	cd android && ./gradlew assembleProdRelease app:assembleProdReleaseAndroidTest -PminSdkVersion=26 -DtestBuildType=release
}

buildAndroidQAE2E(){
	prebuild_android
	cd android && ./gradlew assembleQaRelease app:assembleQaReleaseAndroidTest -PminSdkVersion=26 -DtestBuildType=release
}

buildAndroid() {
	if [ "$MODE" == "release" ] || [ "$MODE" == "main" ] ; then
		buildAndroidRelease
	elif [ "$MODE" == "flask" ] ; then
		buildAndroidFlaskRelease
	elif [ "$MODE" == "QA" ] ; then
		buildAndroidQA
	elif [ "$MODE" == "releaseE2E" ] ; then
		buildAndroidReleaseE2E
	elif [ "$MODE" == "QAE2E" ] ; then
		buildAndroidQAE2E
  elif [ "$MODE" == "debugE2E" ] ; then
		buildAndroidRunE2E
	elif [ "$MODE" == "qaDebug" ] ; then
		buildAndroidRunQA
	elif [ "$MODE" == "flaskDebug" ] ; then
		buildAndroidRunFlask
	elif [ "$MODE" == "devBuild" ] ; then
		buildAndroidDevBuild
	else
		buildAndroidRun
	fi
}

buildAndroidRunE2E(){
	prebuild_android
	if [ -e $ANDROID_ENV_FILE ]
	then
		source $ANDROID_ENV_FILE
	fi
	# Specify specific task name :app:TASKNAME to prevent processing other variants
	cd android && ./gradlew :app:assembleProdDebug :app:assembleProdDebugAndroidTest -PminSdkVersion=26 -DtestBuildType=debug --build-cache && cd ..
}

buildIos() {
	echo "Build iOS $MODE started..."
	if [ "$MODE" == "release" ] || [ "$MODE" == "main" ] ; then
		buildIosRelease
	elif [ "$MODE" == "flask" ] ; then
		buildIosFlaskRelease
	elif [ "$MODE" == "releaseE2E" ] ; then
		buildIosReleaseE2E
	elif [ "$MODE" == "debugE2E" ] ; then
			buildIosSimulatorE2E
	elif [ "$MODE" == "qadebugE2E" ] ; then
			buildIosQASimulatorE2E
	elif [ "$MODE" == "flaskDebugE2E" ] ; then
			buildIosFlaskSimulatorE2E
	elif [ "$MODE" == "QA" ] ; then
		buildIosQA
	elif [ "$MODE" == "qaDebug" ] ; then
		if [ "$RUN_DEVICE" = true ] ; then
			buildIosDeviceQA
		else
			buildIosSimulatorQA
		fi
	elif [ "$MODE" == "flaskDebug" ] ; then
		if [ "$RUN_DEVICE" = true ] ; then
			buildIosDeviceFlask
		else
			buildIosSimulatorFlask
		fi
	elif [ "$MODE" == "devbuild" ] ; then
		buildIosDevBuild
	else
		if [ "$RUN_DEVICE" = true ] ; then
			buildIosDevice
		else
			buildIosSimulator
		fi
	fi
}

startWatcher() {
	source $JS_ENV_FILE
	remapEnvVariableLocal
  	WATCHER_PORT=${WATCHER_PORT:-8081}
	if [ "$MODE" == "clean" ]; then
		watchman watch-del-all
		rm -rf $TMPDIR/metro-cache
		#react-native start --port=$WATCHER_PORT -- --reset-cache
		npx expo start --port $WATCHER_PORT --clear
	else
		#react-native start --port=$WATCHER_PORT
		npx expo start --port $WATCHER_PORT
	fi
}

checkAuthToken() {
	local propertiesFileName="$1"

	if [ -n "${MM_SENTRY_AUTH_TOKEN}" ]; then
		sed -i'' -e "s/auth.token.*/auth.token=${MM_SENTRY_AUTH_TOKEN}/" "./${propertiesFileName}";
	elif ! grep -qE '^auth.token=[[:alnum:]]+$' "./${propertiesFileName}"; then
		printError "Missing auth token in '${propertiesFileName}'; add the token, or set it as MM_SENTRY_AUTH_TOKEN"
		exit 1
	fi

	if [ ! -e "./${propertiesFileName}" ]; then
		if [ -n "${MM_SENTRY_AUTH_TOKEN}" ]; then
			cp "./${propertiesFileName}.example" "./${propertiesFileName}"
			sed -i'' -e "s/auth.token.*/auth.token=${MM_SENTRY_AUTH_TOKEN}/" "./${propertiesFileName}";
		else
			printError "Missing '${propertiesFileName}' file (see '${propertiesFileName}.example' or set MM_SENTRY_AUTH_TOKEN to generate)"
			exit 1
		fi
	fi
}

checkParameters "$@"


printTitle
loadJSEnv

echo "PLATFORM = $PLATFORM"
echo "MODE = $MODE"
echo "TARGET = $TARGET"

if [ "$MODE" == "main" ] && { [ "$TARGET" == "production" ] || [ "$TARGET" == "beta" ] || [ "$TARGET" == "rc" ]; }; then
  export METAMASK_BUILD_TYPE="$MODE"
  export METAMASK_ENVIRONMENT="$TARGET"
  export GENERATE_BUNDLE=true # Used only for Android
  export PRE_RELEASE=true # Used mostly for iOS, for Android only deletes old APK and installs new one
  if [ "$TARGET" == "production" ]; then
    remapEnvVariableProduction
  elif [ "$TARGET" == "beta" ]; then
    remapEnvVariableBeta
  elif [ "$TARGET" == "rc" ]; then
    remapEnvVariableReleaseCandidate
  fi
fi

if [ "$MODE" == "releaseE2E" ] || [ "$MODE" == "QA" ] || [ "$MODE" == "QAE2E" ]; then
	echo "DEBUG SENTRY PROPS"
	checkAuthToken 'sentry.debug.properties'
	export SENTRY_PROPERTIES="${REPO_ROOT_DIR}/sentry.debug.properties"
elif [ "$MODE" == "release" ] || [ "$MODE" == "flask" ] || [ "$MODE" == "main" ]; then
	echo "RELEASE SENTRY PROPS"
	checkAuthToken 'sentry.release.properties'
	export SENTRY_PROPERTIES="${REPO_ROOT_DIR}/sentry.release.properties"
fi

if [ -z "$METAMASK_BUILD_TYPE" ]; then
	printError "Missing METAMASK_BUILD_TYPE; set to 'main' for a standard release, or 'flask' for a canary flask release. The default value is 'main'."
	exit 1
else
    echo "METAMASK_BUILD_TYPE is set to: $METAMASK_BUILD_TYPE"
fi

if [ -z "$METAMASK_ENVIRONMENT" ]; then
	printError "Missing METAMASK_ENVIRONMENT; set to 'production' for a production release, 'prerelease' for a pre-release, or 'local' otherwise"
	exit 1
else
    echo "METAMASK_ENVIRONMENT is set to: $METAMASK_ENVIRONMENT"
fi

if [ "$PLATFORM" == "ios" ]; then
	# we don't care about env file in CI
	if [ -f "$IOS_ENV_FILE" ] || [ "$CI" = true ]; then
		buildIos
	else
		envFileMissing $IOS_ENV_FILE
	fi
elif [ "$PLATFORM" == "watcher" ]; then
	startWatcher
else
	# we don't care about env file in CI
	if [ -f "$ANDROID_ENV_FILE" ] || [ "$CI" = true ]; then
		buildAndroid
	else
		envFileMissing $ANDROID_ENV_FILE
	fi
fi
