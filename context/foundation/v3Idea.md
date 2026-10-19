A couple of things to do here.
## 1. Change the landing site.
- currently the landing site has text akin to "10x Astro Starter", with a subtitle and 3 panels below.
- The title should be changed to "NoteItDown"
- The subtitle should be changed to "A TTRPG notepad that makes relations managing and data recall easy."
- The panels:
    - "Authentication ready" and its description to:
        ### "Make notes"
        "Note the NPC, note their quest and reference the NPC in the description"
    - "Modern stack" and its description to:
        ### "Keep noting"
        "The references are updated automatically whenever you update, add or delete a note. Immediately."
    - "Developer experience" and its description to:
        ### "Recall"
        "Find where Boblin the Goblin lived and how much money he owns you through the interactive memory map with search capability."
## 2. Per-user note-image storage quota and full-resolution image popup path
- Parked item (context/foundation/prd-v2.md).
## 3. Shared error boundary / 503 helper 
- Parked item (context/foundation/prd-v2.md).
## 4. Fuzzy search, search in notes' descriptions
- the search bars extended to look for data in notes' description. Helping with finding for example an NPC whose exact name the player forgot.
    - description search as toggleable option due to, most likely, a bit higher processing power needed than regular header-based search
    - fuzzy search toggleable as well. 