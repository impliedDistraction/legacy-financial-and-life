# Event Speaker Images Setup

## Required Images for Event Section

The following speaker images need to be manually downloaded and placed in the `/public/images/` directory:

### 1. Tim & Beth Byrd
- **File name**: `tim-beth-byrd-speakers.jpg`
- **Source URL**: https://github.com/user-attachments/assets/7531401e-2c1d-4cdc-bf8f-25bb74a6fdb9
- **Description**: Professional photo of Tim and Beth Byrd together
- **Usage**: First speaker card in the event hosts section

### 2. Mike Morice  
- **File name**: `mike-morice-speaker.jpg`
- **Source URL**: https://github.com/user-attachments/assets/7bf81573-6041-4567-9cd8-f4ca13af0178
- **Description**: Professional headshot of Mike Morice
- **Usage**: Second speaker card in the event hosts section

### 3. Mo Dadkhah
- **File name**: `mo-dadkhah-speaker.jpg` 
- **Source URL**: https://github.com/user-attachments/assets/fc63335a-264d-415e-847d-cb38659a411b
- **Description**: Professional headshot of Mo Dadkhah
- **Usage**: Third speaker card in the event hosts section

## Instructions

1. Download each image from the GitHub URLs above
2. Rename them to the specified file names
3. Place them in the `/public/images/` directory
4. The images should be approximately 400x400 pixels for optimal display
5. Ensure they are in JPG format for consistency

## Fallback Behavior

If the images are not present, the speaker cards will display placeholder icons with the speaker names, so the site will continue to function correctly.

## Implementation Details

The speaker images are mapped by speaker name in the `wills-trusts-event.astro` file:
- 'Tim & Beth Byrd' → `tim-beth-byrd-speakers.jpg`
- 'Mike Morice' → `mike-morice-speaker.jpg`  
- 'Mo Dadkhah' → `mo-dadkhah-speaker.jpg`