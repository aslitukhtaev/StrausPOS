; Delfin Sauna — Windows Firewall qoidalari (ikkinchi kompyuter "faqat ko'rish" rejimi uchun).
; TCP 47321 (LAN server) va UDP 47322 (qidiruv), faqat "private" (uy/ish Wi-Fi) profilida.
; netsh administrator huquqini talab qiladi; huquq bo'lmasa jim o'tadi (Windows birinchi ishga tushishda o'zi so'raydi).

!macro delfinFirewallRemove
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Delfin Sauna LAN (TCP 47321)"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Delfin Sauna LAN (UDP 47322)"'
  Pop $0
!macroend

!macro customInstall
  !insertmacro delfinFirewallRemove
  nsExec::Exec 'netsh advfirewall firewall add rule name="Delfin Sauna LAN (TCP 47321)" dir=in action=allow protocol=TCP localport=47321 profile=private'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="Delfin Sauna LAN (UDP 47322)" dir=in action=allow protocol=UDP localport=47322 profile=private'
  Pop $0
!macroend

!macro customUnInstall
  !insertmacro delfinFirewallRemove
!macroend
