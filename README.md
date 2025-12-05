The explanatory docs are at https://github.com/hexronuspi/securelock/blob/main/IICPC_DOCS.pdf
<br/>

Run these code to fix the host through which the extension will communicate with the .exe


First clone the codebase, then Use chrome to build your own extension using the extension tab, just import the /extension folder.

then run the below code,

```
reg add "HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.exam.shield" /ve /t REG_SZ /d ".\securelock\com.exam.shield.json" /f
```

```
reg query "HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.exam.shield"
```

Then, the below should show `True`

```
Test-Path ".\securelock\ExamShield.exe"
```


Install WebPackage

```
npm i
```

```
npm run dev
```


Visit `localhost:3000`  
