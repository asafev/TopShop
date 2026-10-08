/**
 * Fonts Detector Module - OPTIMIZED VERSION
 * 
 * High-performance font fingerprinting with minimal latency.
 * Extended with CreepJS-inspired categorization and dimension fingerprinting.
 * 
 * Key features:
 * 1. CURATED FONT LIST: ~500 high-entropy fonts with platform categorization
 * 2. BATCH DOM OPERATIONS: Single reflow for presence detection
 * 3. PLATFORM INFERENCE: Detect likely OS from font patterns
 * 4. DIMENSION FINGERPRINTING: Measure actual rendered font dimensions (CreepJS)
 * 5. FONT CATEGORIZATION: Track which font categories are installed
 * 
 * @module detectors/fonts
 * @see PerimeterX font detection (07_fingerprint.js)
 * @see CreepJS fonts.js - Platform detection and dimension fingerprinting
 */

import { fnv1a32 } from './audioFingerprint.js';
import { getEmojiFingerprint } from './emojii.js';

const FONTS_CONFIG = {
    timeout: 3000,
    emojiSize: 50,
    // Enable extended dimension fingerprinting (slightly slower but more unique)
    enableDimensionFingerprinting: true,
    // Number of fonts to test for dimension fingerprinting (subset for performance)
    dimensionFingerprintCount: 30
};

// ============================================================================
// FONT CATEGORIES - For platform inference and analysis
// Based on CreepJS categorization approach
// ============================================================================

/**
 * Platform-specific font indicators
 * Fonts that strongly indicate a specific platform when detected
 */
const PLATFORM_INDICATOR_FONTS = {
    windows: [
        // Windows 10/11 specific
        "Segoe UI Variable", "Segoe Fluent Icons", "Cascadia Code", "Cascadia Mono",
        "HoloLens MDL2 Assets", "Segoe MDL2 Assets", "Ink Free", "Bahnschrift",
        // Windows core
        "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Segoe Print", "Segoe Script",
        "Microsoft YaHei", "Microsoft JhengHei", "Yu Gothic", "Yu Gothic UI",
        "Malgun Gothic", "Meiryo", "Meiryo UI", "SimSun", "SimHei", "NSimSun",
        // Windows Office
        "Calibri", "Cambria", "Consolas", "Candara", "Corbel", "Constantia",
        "Aptos", "Grandview", "Seaford", "Tenorite"
    ],
    macos: [
        // macOS system fonts
        "San Francisco", "SF Pro", "SF Mono", "SF Compact", "New York",
        "Apple Color Emoji", "Apple SD Gothic Neo", "Apple Symbols",
        // macOS bundled
        "Avenir", "Avenir Next", "Helvetica Neue", "Menlo", "Monaco",
        "Lucida Grande", "Geneva", "Optima", "Skia", "Hoefler Text",
        "PingFang SC", "PingFang TC", "PingFang HK", "Hiragino Sans",
        "Hiragino Kaku Gothic Pro", "Hiragino Mincho Pro",
        // macOS exclusive
        "Zapfino", "Phosphate", "SignPainter", "Chalkboard SE", "Noteworthy",
        "Apple Chancery", "Luminari", "Trattatello", "Herculanum"
    ],
    linux: [
        // Linux-specific
        "Ubuntu", "Ubuntu Mono", "Ubuntu Condensed", "Cantarell",
        "DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono",
        "Liberation Sans", "Liberation Serif", "Liberation Mono",
        "Noto Sans CJK JP", "Noto Sans CJK SC", "Noto Sans CJK KR",
        "Droid Sans", "Droid Serif", "Droid Sans Mono",
        "FreeSans", "FreeSerif", "FreeMono",
        "Nimbus Sans", "Nimbus Roman", "URW Gothic", "URW Bookman",
        // Linux i18n fonts
        "Lohit Devanagari", "Lohit Tamil", "Lohit Bengali",
        "Garuda", "Norasi", "Tlwg Typo", "Waree"
    ],
    ios: [
        // iOS-specific (subset of macOS)
        "San Francisco", "SF Pro", "Apple Color Emoji",
        "PingFang SC", "Hiragino Sans"
    ],
    android: [
        // Android-specific
        "Roboto", "Droid Sans", "Noto Color Emoji", "Noto Sans"
    ]
};

/**
 * Font categories for fingerprint analysis
 */
const FONT_CATEGORIES = {
    // Core system fonts (high entropy, cross-platform)
    core: [
        "Arial", "Arial Black", "Arial Hebrew", "Arial Rounded MT Bold",
        "Arial Unicode MS", "Book Antiqua", "Bookman Old Style", "Courier",
        "Courier New", "Georgia", "Helvetica", "Impact", "Palatino",
        "Palatino Linotype", "Tahoma", "Times", "Times New Roman",
        "Trebuchet MS", "Verdana", "Comic Sans MS", "Century", "Century Gothic"
    ],
    
    // Noto font family (i18n coverage indicator)
    noto: [
        "Noto Sans", "Noto Serif", "Noto Mono", "Noto Sans JP", "Noto Sans KR",
        "Noto Sans SC", "Noto Sans TC", "Noto Serif JP", "Noto Serif KR",
        "Noto Serif SC", "Noto Serif TC", "Noto Sans CJK JP", "Noto Sans CJK KR",
        "Noto Sans CJK SC", "Noto Sans CJK TC", "Noto Naskh Arabic",
        "Noto Sans Armenian", "Noto Sans Bengali", "Noto Sans Cherokee",
        "Noto Sans Devanagari", "Noto Sans Ethiopic", "Noto Sans Georgian",
        "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Hebrew",
        "Noto Sans Kannada", "Noto Sans Khmer", "Noto Sans Lao",
        "Noto Sans Malayalam", "Noto Sans Mongolian", "Noto Sans Myanmar",
        "Noto Sans Oriya", "Noto Sans Sinhala", "Noto Sans Tamil",
        "Noto Sans Telugu", "Noto Sans Thaana", "Noto Sans Thai",
        "Noto Sans Tibetan", "Noto Sans Yi", "Noto Serif Armenian",
        "Noto Serif Khmer", "Noto Serif Lao", "Noto Serif Thai",
        "Noto Kufi Arabic", "Noto Nastaliq Urdu", "Noto Color Emoji"
    ],
    
    // Google Fonts (web font locally installed indicator)
    google: [
        "Open Sans", "Roboto", "Lato", "Montserrat", "Oswald", "Raleway",
        "Poppins", "Ubuntu", "Nunito", "Rubik", "Work Sans", "Inter",
        "Playfair Display", "Merriweather", "Quicksand", "Karla",
        "Fira Sans", "Fira Code", "Fira Mono", "Source Sans Pro",
        "Source Code Pro", "Source Serif Pro", "IBM Plex Sans", "IBM Plex Mono",
        "DM Sans", "Space Grotesk", "Space Mono", "Red Hat Display",
        "Barlow", "Overpass", "Archivo", "Titillium Web", "Exo", "Exo 2",
        "Cabin", "Prompt", "Sarabun", "Kanit", "Chakra Petch",
        "Dancing Script", "Pacifico", "Caveat", "Indie Flower",
        "Permanent Marker", "Lobster", "Bebas Neue", "Anton"
    ],
    
    // Adobe/Creative professional fonts
    adobe: [
        "Adobe Caslon Pro", "Adobe Garamond Pro", "Adobe Arabic",
        "Adobe Devanagari", "Adobe Hebrew", "Myriad Pro", "Minion Pro",
        "Adobe Fan Heiti Std", "Adobe Fangsong Std", "Adobe Gothic Std",
        "Adobe Heiti Std", "Adobe Kaiti Std", "Adobe Ming Std",
        "Adobe Myungjo Std", "Adobe Song Std"
    ],
    
    // Developer/Monospace fonts (developer profile indicator)
    developer: [
        "Consolas", "Monaco", "Menlo", "Fira Code", "Fira Mono",
        "JetBrains Mono", "Cascadia Code", "Cascadia Mono", "Source Code Pro",
        "IBM Plex Mono", "Inconsolata", "Anonymous Pro", "Hack",
        "Ubuntu Mono", "DejaVu Sans Mono", "Liberation Mono", "Roboto Mono",
        "Space Mono", "Red Hat Mono", "Oxygen Mono", "Overpass Mono",
        "Droid Sans Mono", "PT Mono", "Courier New", "Andale Mono"
    ],
    
    // CJK fonts (East Asian language support)
    cjk: [
        "SimSun", "SimHei", "NSimSun", "FangSong", "KaiTi", "DengXian",
        "Microsoft YaHei", "Microsoft JhengHei", "MingLiU", "PMingLiU",
        "Yu Gothic", "Yu Mincho", "Meiryo", "MS Gothic", "MS Mincho",
        "Malgun Gothic", "Batang", "Dotum", "Gulim", "Gungsuh",
        "PingFang SC", "PingFang TC", "Hiragino Sans", "Hiragino Mincho Pro",
        "Songti SC", "Heiti SC", "STHeiti", "STSong", "STKaiti"
    ],
    
    // Symbol/Icon fonts (application indicator)
    symbols: [
        "Wingdings", "Wingdings 2", "Wingdings 3", "Webdings", "Symbol",
        "Zapf Dingbats", "FontAwesome", "Material Icons", "Ionicons",
        "Glyphicons Halflings", "Font Awesome 5 Free", "Font Awesome 5 Brands"
    ]
};

/**
 * Dimension fingerprinting fonts - subset of high-variance fonts
 * These fonts have the most distinct rendering dimensions across platforms
 * Based on CreepJS research
 */
const DIMENSION_FINGERPRINT_FONTS = [
    "Arial", "Arial Black", "Calibri", "Cambria", "Comic Sans MS",
    "Consolas", "Courier New", "Georgia", "Helvetica", "Helvetica Neue",
    "Impact", "Lucida Console", "Lucida Sans", "Monaco", "Palatino",
    "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
    "Menlo", "San Francisco", "Roboto", "Ubuntu", "DejaVu Sans",
    "Fira Code", "Source Code Pro", "Noto Sans", "Open Sans", "Lato"
];

/**
 * HIGH-ENTROPY FONT LIST - Curated for maximum fingerprinting value
 * Extended with additional high-value fonts from CreepJS
 */
const FONT_LIST = [
    // === CORE SYSTEM FONTS (high entropy, cross-platform) ===
    "Andale Mono", "Arial", "Arial Black", "Arial Hebrew", "Arial MT",
    "Arial Narrow", "Arial Rounded MT Bold", "Arial Unicode MS",
    "Bitstream Vera Sans Mono", "Book Antiqua", "Bookman Old Style",
    "Calibri", "Cambria", "Cambria Math", "Century", "Century Gothic",
    "Century Schoolbook", "Comic Sans", "Comic Sans MS", "Consolas",
    "Courier", "Courier New", "Geneva", "Georgia", "Helvetica",
    "Helvetica Neue", "Impact", "Lucida Bright", "Lucida Calligraphy",
    "Lucida Console", "Lucida Fax", "LUCIDA GRANDE", "Lucida Handwriting",
    "Lucida Sans", "Lucida Sans Typewriter", "Lucida Sans Unicode",
    "Microsoft Sans Serif", "Monaco", "Monotype Corsiva", "MS Gothic",
    "MS Outlook", "MS PGothic", "MS Reference Sans Serif", "MS Sans Serif",
    "MS Serif", "MYRIAD", "MYRIAD PRO", "Palatino", "Palatino Linotype",
    "Segoe Print", "Segoe Script", "Segoe UI", "Segoe UI Light",
    "Segoe UI Semibold", "Segoe UI Symbol", "Tahoma", "Times",
    "Times New Roman", "Times New Roman PS", "Trebuchet MS", "Verdana",
    "Wingdings", "Wingdings 2", "Wingdings 3",
    
    // === WINDOWS-SPECIFIC (high entropy for Windows detection) ===
    "Segoe UI Emoji", "Segoe MDL2 Assets", "Segoe Fluent Icons",
    "Segoe UI Variable", "Ebrima", "Gadugi", "Myanmar Text", "Nirmala UI",
    "HoloLens MDL2 Assets", "Ink Free", "Cascadia Code", "Cascadia Mono",
    "MS Mincho", "Malgun Gothic", "Microsoft YaHei", "Microsoft JhengHei",
    "Yu Gothic", "Gabriola", "Leelawadee UI", "Javanese Text",
    "Sylfaen", "Estrangelo Edessa", "Kartika", "Latha", "Mangal", "Raavi",
    "Shruti", "Tunga", "Vrinda", "Iskoola Pota", "Kalinga", "Nyala",
    "DaunPenh", "DokChampa", "Euphemia", "Gautami", "Gisha", "Kokila",
    "MV Boli", "Plantagenet Cherokee", "Rod", "Shonar Bangla", "Utsaah",
    "Vani", "Vijaya", "MoolBoran", "Mongolian Baiti", "Microsoft Himalaya",
    "Microsoft New Tai Lue", "Microsoft PhagsPa", "Microsoft Tai Le",
    "Microsoft Uighur", "Microsoft YaHei UI", "SimSun", "SimHei", "FangSong",
    "KaiTi", "DengXian", "NSimSun", "SimSun-ExtB", "MingLiU", "PMingLiU",
    "MingLiU-ExtB", "MingLiU_HKSCS", "Batang", "BatangChe", "Dotum", "DotumChe",
    "Gulim", "GulimChe", "Gungsuh", "GungsuhChe", "Meiryo", "Meiryo UI",
    "MS UI Gothic", "Yu Mincho", "Yu Gothic UI", "HGGothicE", "HGPGothicE",
    "HGSGothicE", "HGGothicM", "HGKyokashotai", "HGMaruGothicMPRO",
    
    // === MACOS-SPECIFIC (high entropy for macOS detection) ===
    "San Francisco", "SF Pro", "SF Mono", "SF Compact", "New York",
    "Apple Color Emoji", "Apple SD Gothic Neo", "Avenir", "Avenir Next",
    "Charter", "Seravek", "Menlo", "Optima", "Skia", "Cochin", "Didot",
    "Futura", "Baskerville", "Big Caslon", "Gill Sans", "Hoefler Text",
    "American Typewriter", "Marker Felt", "Chalkboard", "Noteworthy",
    "PingFang SC", "PingFang TC", "PingFang HK", "Hiragino Sans", 
    "Hiragino Kaku Gothic Pro", "Hiragino Kaku Gothic ProN", "Hiragino Kaku Gothic Std",
    "Hiragino Kaku Gothic StdN", "Hiragino Maru Gothic Pro", "Hiragino Maru Gothic ProN",
    "Hiragino Mincho Pro", "Hiragino Mincho ProN", "Hiragino Sans GB",
    "Apple Braille", "Apple Chancery", "Apple LiGothic", "Apple LiSung",
    "Apple Myungjo", "Apple Symbols", "AppleGothic", "AppleMyungjo",
    "Athelas", "Avenir Next Condensed", "Baghdad", "Bangla MN", "Bangla Sangam MN",
    "Baoli SC", "Beirut", "BiauKai", "Bradley Hand", "Brush Script MT",
    "Chalkboard SE", "Chalkduster", "Copperplate", "Corsiva Hebrew",
    "Damascus", "DecoType Naskh", "Devanagari MT", "Devanagari Sangam MN",
    "Diwan Kufi", "Diwan Thuluth", "Euphemia UCAS", "Farah", "Farisi",
    "GB18030 Bitmap", "Geeza Pro", "Geneva CY", "Gujarati MT",
    "Gujarati Sangam MN", "Gurmukhi MN", "Gurmukhi MT", "Gurmukhi Sangam MN",
    "Hannotate SC", "Hannotate TC", "HanziPen SC", "HanziPen TC", "HeadLineA",
    "Hei", "Heiti SC", "Heiti TC", "Herculanum", "ITF Devanagari", "InaiMathi",
    "Kai", "Kaiti SC", "Kaiti TC", "Kannada MN", "Kannada Sangam MN", "Kefa",
    "Khmer MN", "Khmer Sangam MN", "Kohinoor Bangla", "Kohinoor Devanagari",
    "Kohinoor Gujarati", "Kohinoor Telugu", "Kokonor", "Krungthep",
    "KufiStandardGK", "Lantinghei SC", "Lantinghei TC", "Lao MN", "Lao Sangam MN",
    "Libian SC", "LiHei Pro", "LiSong Pro", "Luminari", "Malayalam MN",
    "Malayalam Sangam MN", "Marion", "Mishafi", "Mishafi Gold", "Mshtakan",
    "Muna", "Nadeem", "Nanum Brush Script", "Nanum Gothic", "Nanum Myeongjo",
    "Nanum Pen Script", "Oriya MN", "Oriya Sangam MN", "Osaka", "Osaka-Mono",
    "Papyrus", "Party LET", "Phosphate", "PT Mono", "PT Sans", "PT Sans Caption",
    "PT Sans Narrow", "PT Serif", "PT Serif Caption", "Raanana", "Sana", "Sathu",
    "Savoye LET", "Shree Devanagari 714", "SignPainter", "Silom", "Sinhala MN",
    "Sinhala Sangam MN", "Snell Roundhand", "Songti SC", "Songti TC", "STFangsong",
    "STHeiti", "STIXGeneral", "STIXIntegralsD", "STIXIntegralsSm", "STIXIntegralsUp",
    "STIXIntegralsUpD", "STIXIntegralsUpSm", "STIXNonUnicode", "STIXSizeFiveSym",
    "STIXSizeFourSym", "STIXSizeOneSym", "STIXSizeThreeSym", "STIXSizeTwoSym",
    "STIXVariants", "STKaiti", "STSong", "Sukhumvit Set", "Tamil MN",
    "Tamil Sangam MN", "Telugu MN", "Telugu Sangam MN", "Thonburi", "Trattatello",
    "Waseem", "Wawati SC", "Wawati TC", "Weibei SC", "Weibei TC", "Xingkai SC",
    "Yuppy SC", "Yuppy TC", "Yuanti SC", "Zapfino",
    
    // === LINUX-SPECIFIC (high entropy for Linux detection) ===
    "Ubuntu", "Ubuntu Mono", "Ubuntu Condensed", "Ubuntu Light", "DejaVu Sans",
    "DejaVu Serif", "DejaVu Sans Mono", "Liberation Sans", "Liberation Serif",
    "Liberation Mono", "Noto Sans", "Noto Serif", "Noto Mono", "Noto Sans CJK JP",
    "Noto Sans CJK KR", "Noto Sans CJK SC", "Noto Sans CJK TC", "Cantarell",
    "Droid Sans", "Droid Sans Mono", "Droid Serif", "FreeSans", "FreeSerif",
    "FreeMono", "Nimbus Sans", "Nimbus Sans L", "Nimbus Mono L", "Nimbus Roman",
    "C059", "D050000L", "P052", "Standard Symbols L", "URW Bookman",
    "URW Gothic", "URW Palladio L", "Z003", "Abyssinica SIL", "Anka/Coder",
    "Bitstream Charter", "Bitstream Vera Sans", "Bitstream Vera Sans Mono",
    "Bitstream Vera Serif", "Caladea", "Carlito", "CMEX10", "CMR10", "CMSY10",
    "EB Garamond", "Gargi", "Garuda", "Gentium Basic", "Gentium Book Basic",
    "Gudea", "Gubbi", "Jamrul", "Jomolhari", "Kacst-one", "KacstBook", "KacstOffice",
    "Kalapi", "Kedage", "Khmeros", "KodchiangUPC", "Laksaman", "Lohit Assamese",
    "Lohit Bengali", "Lohit Devanagari", "Lohit Gujarati", "Lohit Gurmukhi",
    "Lohit Kannada", "Lohit Malayalam", "Lohit Odia", "Lohit Tamil", "Lohit Telugu",
    "Loma", "Mukti Narrow", "Nakula", "Navilu", "Norasi", "Noto Kufi Arabic",
    "Noto Naskh Arabic", "Noto Nastaliq Urdu", "Padauk", "Pagul", "Pothana2000",
    "Purisa", "Rachana", "Rekha", "Saab", "Sahadeva", "Samanata", "Samyak Devanagari",
    "Samyak Gujarati", "Samyak Malayalam", "Samyak Tamil", "Sarai", "Sawasdee",
    "Skeena", "TakaoPGothic", "TlwgMono", "TlwgTypewriter", "Tlwg Typist", "Tlwg Typo",
    "TSCu_Paranar", "Umpush", "Uroob", "Vemana2000", "Waree",
    
    // === APPLICATION FONTS (installed apps fingerprinting) ===
    "Adobe Caslon Pro", "Adobe Garamond Pro", "Adobe Arabic", "Adobe Devanagari",
    "Adobe Fan Heiti Std", "Adobe Fangsong Std", "Adobe Gothic Std", "Adobe Heiti Std",
    "Adobe Hebrew", "Adobe Kaiti Std", "Adobe Ming Std", "Adobe Myungjo Std",
    "Adobe Song Std", "Myriad Pro", "Minion Pro", "Source Sans Pro", "Source Code Pro",
    "Source Serif Pro", "Fira Code", "Fira Mono", "Fira Sans", "Roboto", "Roboto Mono",
    "Roboto Condensed", "Roboto Slab", "Open Sans", "Lato", "Montserrat", "Oswald",
    "Raleway", "Poppins", "Nunito", "Rubik", "Work Sans", "Inter",
    "Playfair Display", "Merriweather", "Quicksand", "Karla",
    "Inconsolata", "JetBrains Mono", "IBM Plex Sans", "IBM Plex Mono", "IBM Plex Serif",
    "DM Sans", "Manrope", "Space Grotesk", "Space Mono", "Red Hat Display",
    "Red Hat Text", "Red Hat Mono", "Barlow", "Barlow Condensed", "Barlow Semi Condensed",
    "Overpass", "Overpass Mono", "Archivo", "Archivo Narrow", "Titillium Web",
    "Exo", "Exo 2", "Oxygen", "Oxygen Mono", "Hind", "Hind Madurai", "Hind Siliguri",
    "Cabin", "Cabin Condensed", "Prompt", "Sarabun", "Kanit", "Chakra Petch",
    "Varela Round", "Yanone Kaffeesatz", "ABeeZee", "Questrial", "Signika",
    "Assistant", "Heebo", "Alef", "Frank Ruhl Libre", "Miriam Libre", "Amatic SC",
    "Dancing Script", "Pacifico", "Shadows Into Light", "Caveat", "Indie Flower",
    "Permanent Marker", "Lobster", "Bebas Neue", "Anton", "Righteous", "Bangers",
    "Fredoka One", "Alfa Slab One", "Russo One", "Abril Fatface", "Patua One",
    
    // === GOOGLE FONTS (web fonts that may be installed locally) ===
    "Noto Sans JP", "Noto Sans KR", "Noto Sans SC", "Noto Sans TC",
    "Noto Serif JP", "Noto Serif KR", "Noto Serif SC", "Noto Serif TC",
    "M PLUS 1p", "M PLUS Rounded 1c", "Sawarabi Gothic", "Sawarabi Mincho",
    "Kosugi", "Kosugi Maru", "Zen Kaku Gothic New", "Zen Maru Gothic",
    "Nanum Gothic Coding", "Do Hyeon", "Black Han Sans", "Jua", "Sunflower",
    "Gamja Flower", "East Sea Dokdo", "Stylish", "Poor Story", "Single Day",
    "Cute Font", "Hi Melody", "Gaegu", "Dokdo", "Song Myung", "Yeon Sung",
    "Gothic A1", "Gugi", "Kirang Haerang", "Hahmlet", "Gowun Batang", "Gowun Dodum",
    "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Thai", "Tajawal", "Cairo",
    "Almarai", "Amiri", "Scheherazade New", "Markazi Text", "IBM Plex Sans Arabic",
    "IBM Plex Sans Hebrew", "IBM Plex Sans Thai",
    
    // === MICROSOFT OFFICE FONTS ===
    "Aptos", "Grandview", "Seaford", "Tenorite", "Corbel", "Constantia",
    "Candara", "Cambria Math", "Sitka Small", "Sitka Text", "Sitka Subheading",
    "Sitka Heading", "Sitka Display", "Sitka Banner", "Bahnschrift",
    "Franklin Gothic Medium", "Gill Sans MT", "Gill Sans MT Condensed",
    "Rockwell", "Rockwell Condensed", "Rockwell Extra Bold", "Agency FB",
    "Blackadder ITC", "Bodoni MT", "Bodoni MT Condensed", "Britannic Bold",
    "Broadway", "Castellar", "Centaur", "Chiller", "Colonna MT", "Cooper Black",
    "Copperplate Gothic Bold", "Copperplate Gothic Light", "Curlz MT",
    "Edwardian Script ITC", "Elephant", "Engravers MT", "Eras Bold ITC",
    "Eras Demi ITC", "Eras Light ITC", "Eras Medium ITC", "Felix Titling",
    "Footlight MT Light", "Forte", "Franklin Gothic Book", "Franklin Gothic Demi",
    "Franklin Gothic Demi Cond", "Franklin Gothic Heavy", "Freestyle Script",
    "French Script MT", "Gigi", "Gloucester MT Extra Condensed", "Goudy Old Style",
    "Goudy Stout", "Haettenschweiler", "Harlow Solid Italic", "Harrington",
    "High Tower Text", "Imprint MT Shadow", "Informal Roman", "Jokerman",
    "Juice ITC", "Kristen ITC", "Kunstler Script", "Lucida Calligraphy",
    "Lucida Fax", "Lucida Handwriting", "Magneto", "Maiandra GD",
    "Matura MT Script Capitals", "Mistral", "Modern No. 20", "Niagara Engraved",
    "Niagara Solid", "OCR A Extended", "Old English Text MT", "Onyx",
    "Palace Script MT", "Parchment", "Perpetua", "Perpetua Titling MT",
    "Playbill", "Poor Richard", "Pristina", "Rage Italic", "Ravie",
    "Showcard Gothic", "Snap ITC", "Stencil", "Tempus Sans ITC",
    "Tw Cen MT", "Tw Cen MT Condensed", "Viner Hand ITC", "Vivaldi", "Vladimir Script",
    
    // === NOTO I18N FONTS (from CreepJS notoFonts list) ===
    "Noto Naskh Arabic", "Noto Sans Armenian", "Noto Sans Bengali",
    "Noto Sans Buginese", "Noto Sans Canadian Aboriginal", "Noto Sans Cherokee",
    "Noto Sans Devanagari", "Noto Sans Ethiopic", "Noto Sans Georgian",
    "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Hebrew",
    "Noto Sans JP Regular", "Noto Sans KR Regular", "Noto Sans Kannada",
    "Noto Sans Khmer", "Noto Sans Lao", "Noto Sans Malayalam",
    "Noto Sans Mongolian", "Noto Sans Myanmar", "Noto Sans Oriya",
    "Noto Sans SC Regular", "Noto Sans Sinhala", "Noto Sans TC Regular",
    "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Thaana",
    "Noto Sans Thai", "Noto Sans Tibetan", "Noto Sans Yi",
    "Noto Serif Armenian", "Noto Serif Khmer", "Noto Serif Lao", "Noto Serif Thai",
    
    // === SYMBOL/SPECIAL FONTS (unique fingerprint) ===
    "Webdings", "Symbol", "MT Extra", "Zapf Dingbats", "FontAwesome",
    "Material Icons", "Material Icons Outlined", "Material Icons Round",
    "Material Icons Sharp", "Material Icons Two Tone", "Font Awesome 5 Free",
    "Font Awesome 5 Brands", "Ionicons", "Glyphicons Halflings",
    "IcoMoon-Free", "Linearicons-Free", "Simple-Line-Icons", "Weather Icons",
    "Typicons", "Entypo", "Fontello", "Elusive-Icons", "Oct icons", "Zocial",
    "Maki", "Map Icons", "OpenWeb Icons", "Brandico Font", "Fontelico",
    "MFG Labs Iconset", "Mono Social Icons Font", "Raphael", "Stroke 7",
    "PE-icon-7-stroke", "Iconic Font", "Metrize Icons", "Modern Pictograms",
    "Breviary Emblems", "Foundation Icons"
];

// Font test constants (same as PerimeterX)
const FONT_TEST_STRING = "mmmmmmmmmmlli";
const FONT_TEST_SIZE = "72px";

// Reduced emoji set for faster measurement (high-entropy only)
const EMOJI_CODEPOINTS = [
    [128512], // 😀 - basic emoji
    [129333, 8205, 9794, 65039], // 🧑‍♂️ - ZWJ sequence
    [128105, 8205, 10084, 65039, 8205, 128139, 8205, 128104], // family ZWJ
    [127987, 65039, 8205, 9895, 65039], // rainbow flag
    [128065, 65039, 8205, 128488, 65039], // eye in speech bubble
    [9786], // ☺ - text vs emoji rendering
    [10084], // ❤ - varies by platform
    [9996], // ✌ - hand gesture
    [127344], // 🅰 - squared letter
    [128640] // 🚀 - detailed emoji
];

const EMOJI_CHARS = EMOJI_CODEPOINTS.map((emojiCode) => String.fromCodePoint(...emojiCode));

/**
 * Optimized Fonts Detector Class
 */
class FontsDetector {
    constructor(config = {}) {
        this.config = { ...FONTS_CONFIG, ...config };
        this.metrics = {};
        this.result = null;
    }

    async analyze() {
        const result = await this.collect();
        this.result = result;
        this.metrics = this._formatMetrics(result);
        return this.metrics;
    }

    async collect() {
        const totalStartTime = performance.now();
        
        const timing = {
            totalMs: 0,
            fontTestingMs: 0,
            emojiMeasurementMs: 0,
            platformInferenceMs: 0,
            dimensionFingerprintMs: 0,
            categoryAnalysisMs: 0,
            hashingMs: 0
        };
        
        if (typeof document === 'undefined') {
            return this._getUnsupportedResult('document-unavailable');
        }

        try {
            // Font testing with batch DOM operations
            const fontTestStartTime = performance.now();
            const availableFonts = this._testFontsBatch();
            timing.fontTestingMs = Math.round(performance.now() - fontTestStartTime);
            
            // Platform inference from detected fonts (CreepJS-style)
            const platformStartTime = performance.now();
            const platformInference = this._inferPlatformFromFonts(availableFonts);
            timing.platformInferenceMs = Math.round(performance.now() - platformStartTime);
            
            // Font category analysis
            const categoryStartTime = performance.now();
            const categoryAnalysis = this._analyzeFontCategories(availableFonts);
            timing.categoryAnalysisMs = Math.round(performance.now() - categoryStartTime);
            
            // Dimension fingerprinting (CreepJS-style - measure actual font dimensions)
            const dimensionStartTime = performance.now();
            let dimensionFingerprint = null;
            if (this.config.enableDimensionFingerprinting) {
                dimensionFingerprint = this._getDimensionFingerprint(availableFonts);
            }
            timing.dimensionFingerprintMs = Math.round(performance.now() - dimensionStartTime);
            
            // Emoji measurement using emojii.js (detailed metrics)
            const emojiStartTime = performance.now();
            const emojiResult = getEmojiFingerprint({ includeTiming: false });
            timing.emojiMeasurementMs = Math.round(performance.now() - emojiStartTime);
            
            // Hashing
            const hashStartTime = performance.now();
            const fontHash = fnv1a32(availableFonts.sort().join('|'));
            const emojiHash = emojiResult.stableHash;
            const categoryHash = fnv1a32(JSON.stringify(categoryAnalysis.categoryCounts));
            const dimensionHash = dimensionFingerprint ? fnv1a32(dimensionFingerprint.dimensionSignature) : null;
            // Combined fingerprint hash (higher entropy)
            const combinedHash = fnv1a32([fontHash, emojiHash, categoryHash, dimensionHash].filter(Boolean).join('|'));
            timing.hashingMs = Math.round(performance.now() - hashStartTime);
            
            timing.totalMs = Math.round(performance.now() - totalStartTime);

            return {
                supported: true,
                fonts: availableFonts,
                fontsCount: availableFonts.length,
                fontHash,
                // NEW: Platform inference
                platformInference,
                // NEW: Category analysis
                categoryAnalysis,
                // NEW: Dimension fingerprinting
                dimensionFingerprint,
                dimensionHash,
                // NEW: Combined high-entropy hash
                combinedHash,
                // NEW: Category hash
                categoryHash,
                // Emoji fingerprinting (existing)
                emoji: emojiResult.stable,
                emojiHash,
                emojiMetrics: emojiResult.emojiMetrics,
                emojiAggregates: emojiResult.aggregates,
                timing,
                error: null
            };
        } catch (error) {
            return {
                supported: true,
                fonts: [],
                fontsCount: 0,
                fontHash: fnv1a32('error'),
                platformInference: { likely: 'unknown', scores: {} },
                categoryAnalysis: { categoryCounts: {}, totalCategories: 0 },
                dimensionFingerprint: null,
                dimensionHash: null,
                combinedHash: fnv1a32('error'),
                categoryHash: fnv1a32('error'),
                emoji: null,
                emojiHash: fnv1a32('error'),
                timing: {
                    totalMs: Math.round(performance.now() - totalStartTime),
                    fontTestingMs: 0,
                    emojiMeasurementMs: 0,
                    platformInferenceMs: 0,
                    dimensionFingerprintMs: 0,
                    categoryAnalysisMs: 0,
                    hashingMs: 0,
                    error: true
                },
                error: error.message || 'font-detection-error'
            };
        }
    }

    /**
     * Infer likely platform from detected fonts (CreepJS-style)
     * Uses platform indicator fonts to compute probability scores
     * 
     * @private
     * @param {string[]} detectedFonts - Array of detected font names
     * @returns {Object} Platform inference result
     */
    _inferPlatformFromFonts(detectedFonts) {
        const fontSet = new Set(detectedFonts.map(f => f.toLowerCase()));
        const scores = {};
        const matchedFonts = {};
        
        for (const [platform, indicatorFonts] of Object.entries(PLATFORM_INDICATOR_FONTS)) {
            let matches = 0;
            const matched = [];
            
            for (const font of indicatorFonts) {
                if (fontSet.has(font.toLowerCase())) {
                    matches++;
                    matched.push(font);
                }
            }
            
            // Score is the percentage of platform-specific fonts detected
            scores[platform] = indicatorFonts.length > 0 
                ? Math.round((matches / indicatorFonts.length) * 100) 
                : 0;
            matchedFonts[platform] = matched;
        }
        
        // Find likely platform (highest score)
        let likely = 'unknown';
        let maxScore = 0;
        let confidence = 'low';
        
        for (const [platform, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                likely = platform;
            }
        }
        
        // Determine confidence level
        if (maxScore >= 60) {
            confidence = 'high';
        } else if (maxScore >= 30) {
            confidence = 'medium';
        } else {
            confidence = 'low';
        }
        
        // Detect cross-platform (e.g., Windows with macOS fonts via Office)
        const significantPlatforms = Object.entries(scores)
            .filter(([_, score]) => score >= 20)
            .map(([platform, _]) => platform);
        
        const isCrossPlatform = significantPlatforms.length > 1;
        
        return {
            likely,
            confidence,
            scores,
            matchedFonts,
            isCrossPlatform,
            significantPlatforms,
            platformSignature: fnv1a32(JSON.stringify(scores))
        };
    }
    
    /**
     * Analyze detected fonts by category
     * Provides insight into user's font profile
     * 
     * @private
     * @param {string[]} detectedFonts - Array of detected font names
     * @returns {Object} Category analysis result
     */
    _analyzeFontCategories(detectedFonts) {
        const fontSet = new Set(detectedFonts.map(f => f.toLowerCase()));
        const categoryCounts = {};
        const categoryFonts = {};
        
        for (const [category, fonts] of Object.entries(FONT_CATEGORIES)) {
            let count = 0;
            const matched = [];
            
            for (const font of fonts) {
                if (fontSet.has(font.toLowerCase())) {
                    count++;
                    matched.push(font);
                }
            }
            
            categoryCounts[category] = count;
            categoryFonts[category] = matched;
        }
        
        // Detect user profile indicators
        const profile = [];
        
        if (categoryCounts.developer >= 5) {
            profile.push('developer');
        }
        if (categoryCounts.adobe >= 3) {
            profile.push('creative-professional');
        }
        if (categoryCounts.google >= 10) {
            profile.push('web-designer');
        }
        if (categoryCounts.cjk >= 8) {
            profile.push('cjk-language-user');
        }
        if (categoryCounts.noto >= 5) {
            profile.push('i18n-configured');
        }
        if (categoryCounts.symbols >= 3) {
            profile.push('app-developer');
        }
        
        // Total detected across all categories
        const totalCategorized = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
        const activeCategories = Object.entries(categoryCounts)
            .filter(([_, count]) => count > 0)
            .length;
        
        return {
            categoryCounts,
            categoryFonts,
            profile,
            totalCategorized,
            activeCategories,
            // Unique categorization signature
            categorySignature: fnv1a32(Object.entries(categoryCounts).sort().map(e => e.join(':')).join('|'))
        };
    }
    
    /**
     * Dimension fingerprinting (CreepJS-style)
     * Measures actual rendered font dimensions for high-entropy fingerprint
     * Different rendering engines produce slightly different dimensions
     * 
     * @private
     * @param {string[]} detectedFonts - Array of detected font names
     * @returns {Object} Dimension fingerprint result
     */
    _getDimensionFingerprint(detectedFonts) {
        const dimensions = [];
        const testString = "mmmmmmmmmmlli";
        const testSize = "72px";
        
        // Create hidden container
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
        
        // Use subset of high-variance fonts that are also detected
        const fontsToTest = DIMENSION_FINGERPRINT_FONTS.filter(font => 
            detectedFonts.includes(font)
        ).slice(0, this.config.dimensionFingerprintCount);
        
        const fragment = document.createDocumentFragment();
        const spans = [];
        
        // Create all test spans at once (batch)
        for (const font of fontsToTest) {
            const span = document.createElement('span');
            span.style.cssText = `
                position:absolute;
                font-size:${testSize};
                font-style:normal;
                font-weight:normal;
                letter-spacing:normal;
                line-height:normal;
                white-space:nowrap;
                font-family:"${font}",monospace;
            `;
            span.textContent = testString;
            fragment.appendChild(span);
            spans.push({ span, font });
        }
        
        container.appendChild(fragment);
        document.body.appendChild(container);
        
        // Batch read dimensions
        for (const { span, font } of spans) {
            dimensions.push({
                font,
                width: span.offsetWidth,
                height: span.offsetHeight
            });
        }
        
        // Cleanup
        document.body.removeChild(container);
        
        // Create dimension signature (highly unique per rendering engine)
        const dimensionSignature = dimensions
            .map(d => `${d.font}:${d.width}x${d.height}`)
            .join('|');
        
        // Extract dimension statistics
        const widths = dimensions.map(d => d.width);
        const heights = dimensions.map(d => d.height);
        
        const stats = {
            avgWidth: widths.length > 0 ? widths.reduce((a, b) => a + b, 0) / widths.length : 0,
            avgHeight: heights.length > 0 ? heights.reduce((a, b) => a + b, 0) / heights.length : 0,
            minWidth: Math.min(...widths),
            maxWidth: Math.max(...widths),
            minHeight: Math.min(...heights),
            maxHeight: Math.max(...heights),
            widthVariance: this._calculateVariance(widths),
            heightVariance: this._calculateVariance(heights)
        };
        
        return {
            dimensions,
            dimensionSignature,
            stats,
            fontsTested: fontsToTest.length
        };
    }
    
    /**
     * Calculate variance of an array of numbers
     * @private
     */
    _calculateVariance(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
        return squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * OPTIMIZED: Batch DOM font testing (PerimeterX method)
     * 
     * Key optimizations:
     * 1. Create ALL span elements in a single DOM fragment
     * 2. Append fragment once (1 reflow for creation)
     * 3. Read ALL dimensions in sequence (1 reflow for reading)
     * 4. Single baseline measurement against fallback font
     * 
     * @private
     * @returns {string[]} Array of detected font names
     */
    _testFontsBatch() {
        const available = [];
        
        // Create hidden container (offscreen, not display:none to allow measurement)
        const testContainer = document.createElement('div');
        testContainer.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
        
        // Create document fragment for batch append
        const fragment = document.createDocumentFragment();
        
        // Create baseline span with non-existent font (falls back to default)
        const createSpan = (fontFamily) => {
            const span = document.createElement('span');
            span.style.cssText = `
                position:absolute;
                font-size:${FONT_TEST_SIZE};
                font-style:normal;
                font-weight:normal;
                letter-spacing:normal;
                line-height:normal;
                text-transform:none;
                text-align:left;
                text-decoration:none;
                white-space:nowrap;
                font-family:${fontFamily};
            `;
            span.textContent = FONT_TEST_STRING;
            return span;
        };
        
        // Create baseline span (PX uses "test-font" as non-existent fallback)
        const baselineSpan = createSpan('"__nonexistent_font__", monospace');
        fragment.appendChild(baselineSpan);
        
        // Create all test spans at once (batch DOM creation)
        const testSpans = [];
        for (const fontFamily of FONT_LIST) {
            // Quote font name and add fallback
            const span = createSpan(`"${fontFamily}", monospace`);
            fragment.appendChild(span);
            testSpans.push({ span, fontFamily });
        }
        
        // Single DOM append (triggers 1 reflow)
        testContainer.appendChild(fragment);
        document.body.appendChild(testContainer);
        
        // Read baseline dimensions
        const baselineWidth = baselineSpan.offsetWidth;
        const baselineHeight = baselineSpan.offsetHeight;
        
        // Read all test span dimensions (batch read, 1 additional reflow)
        for (const { span, fontFamily } of testSpans) {
            const width = span.offsetWidth;
            const height = span.offsetHeight;
            
            // Font detected if dimensions differ from baseline
            if (width !== baselineWidth || height !== baselineHeight) {
                available.push(fontFamily);
            }
        }
        
        // Cleanup
        document.body.removeChild(testContainer);
        
        return available;
    }

    /**
     * Measure emoji rendering for fingerprinting
     * Reduced emoji set for performance
     * @private
     */
    _measureEmoji() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            const size = this.config.emojiSize;
            canvas.width = size;
            canvas.height = size;

            // Running hash (BrowserLeaks method)
            const hashStep = (hash, value) => (69069 * hash + value) % 4294967296;
            let runningHash = 0;

            for (const emoji of EMOJI_CHARS) {
                ctx.clearRect(0, 0, size, size);
                ctx.font = `${size - 10}px Arial`;
                ctx.fillText(emoji, 5, size - 10);

                const imageData = ctx.getImageData(0, 0, size, size);
                const pixels = imageData.data;

                // Count non-transparent pixels
                let filledPixels = 0;
                for (let i = 3; i < pixels.length; i += 4) {
                    if (pixels[i] > 0) filledPixels++;
                }
                
                const metrics = ctx.measureText(emoji);
                const width = Math.round(metrics.width);
                
                runningHash = hashStep(runningHash, width);
                runningHash = hashStep(runningHash, filledPixels);
            }
            
            const hashHex = ('00000000' + runningHash.toString(16)).slice(-8);

            return {
                supported: true,
                runningHash: hashHex,
                emojiCount: EMOJI_CHARS.length
            };
        } catch (e) {
            return {
                supported: false,
                error: e.message || 'emoji-measurement-error'
            };
        }
    }

    /**
     * Get unsupported result structure
     * @private
     */
    _getUnsupportedResult(reason) {
        return {
            supported: false,
            fonts: [],
            fontsCount: 0,
            fontHash: fnv1a32('unsupported'),
            platformInference: { likely: 'unknown', scores: {}, confidence: 'low' },
            categoryAnalysis: { categoryCounts: {}, totalCategories: 0, profile: [] },
            dimensionFingerprint: null,
            dimensionHash: null,
            combinedHash: fnv1a32('unsupported'),
            categoryHash: fnv1a32('unsupported'),
            emoji: null,
            emojiHash: fnv1a32('unsupported'),
            timing: { totalMs: 0, fontTestingMs: 0, emojiMeasurementMs: 0, platformInferenceMs: 0, dimensionFingerprintMs: 0, categoryAnalysisMs: 0, hashingMs: 0 },
            error: reason
        };
    }

    /**
     * Format metrics for fingerprint display
     * Extended with platform inference, category analysis, and dimension fingerprinting
     * @private
     */
    _formatMetrics(result) {
        const metrics = {
            fontsSupported: {
                value: result.supported,
                description: 'Font detection available',
                risk: 'N/A'
            },
            fontsCount: {
                value: result.fontsCount,
                description: 'Number of detected fonts',
                risk: 'N/A'
            },
            fontHash: {
                value: result.fontHash,
                description: 'FNV-1a hash of font list',
                risk: 'N/A'
            },
            
            // === NEW: Combined fingerprint hash ===
            fontsCombinedHash: {
                value: result.combinedHash,
                description: 'Combined high-entropy fingerprint hash (fonts + emoji + categories + dimensions)',
                risk: 'N/A'
            },
            
            // === NEW: Platform inference metrics ===
            platformLikely: {
                value: result.platformInference?.likely,
                description: 'Inferred platform from font profile',
                risk: 'N/A'
            },
            platformConfidence: {
                value: result.platformInference?.confidence,
                description: 'Platform inference confidence (low/medium/high)',
                risk: 'N/A'
            },
            platformScoreWindows: {
                value: result.platformInference?.scores?.windows,
                description: 'Windows platform indicator score (%)',
                risk: 'N/A'
            },
            platformScoreMacos: {
                value: result.platformInference?.scores?.macos,
                description: 'macOS platform indicator score (%)',
                risk: 'N/A'
            },
            platformScoreLinux: {
                value: result.platformInference?.scores?.linux,
                description: 'Linux platform indicator score (%)',
                risk: 'N/A'
            },
            platformScoreAndroid: {
                value: result.platformInference?.scores?.android,
                description: 'Android platform indicator score (%)',
                risk: 'N/A'
            },
            platformScoreIos: {
                value: result.platformInference?.scores?.ios,
                description: 'iOS platform indicator score (%)',
                risk: 'N/A'
            },
            platformIsCrossPlatform: {
                value: result.platformInference?.isCrossPlatform,
                description: 'Multiple platforms detected (e.g., Office on macOS)',
                risk: 'N/A'
            },
            platformSignature: {
                value: result.platformInference?.platformSignature,
                description: 'FNV-1a hash of platform scores',
                risk: 'N/A'
            },
            
            // === NEW: Font category analysis metrics ===
            categoryHash: {
                value: result.categoryHash,
                description: 'FNV-1a hash of category counts',
                risk: 'N/A'
            },
            categoryCore: {
                value: result.categoryAnalysis?.categoryCounts?.core,
                description: 'Core system fonts detected',
                risk: 'N/A'
            },
            categoryNoto: {
                value: result.categoryAnalysis?.categoryCounts?.noto,
                description: 'Noto i18n fonts detected',
                risk: 'N/A'
            },
            categoryGoogle: {
                value: result.categoryAnalysis?.categoryCounts?.google,
                description: 'Google fonts detected (local)',
                risk: 'N/A'
            },
            categoryAdobe: {
                value: result.categoryAnalysis?.categoryCounts?.adobe,
                description: 'Adobe fonts detected',
                risk: 'N/A'
            },
            categoryDeveloper: {
                value: result.categoryAnalysis?.categoryCounts?.developer,
                description: 'Developer/monospace fonts detected',
                risk: 'N/A'
            },
            categoryCjk: {
                value: result.categoryAnalysis?.categoryCounts?.cjk,
                description: 'CJK (East Asian) fonts detected',
                risk: 'N/A'
            },
            categorySymbols: {
                value: result.categoryAnalysis?.categoryCounts?.symbols,
                description: 'Symbol/icon fonts detected',
                risk: 'N/A'
            },
            categoryActiveCount: {
                value: result.categoryAnalysis?.activeCategories,
                description: 'Number of font categories with at least one font',
                risk: 'N/A'
            },
            categoryProfile: {
                value: result.categoryAnalysis?.profile?.join(', ') || 'standard',
                description: 'Inferred user profile from font categories',
                risk: 'N/A'
            },
            
            // === NEW: Dimension fingerprinting metrics ===
            dimensionHash: {
                value: result.dimensionHash,
                description: 'FNV-1a hash of font dimension measurements',
                risk: 'N/A'
            },
            dimensionFontsTested: {
                value: result.dimensionFingerprint?.fontsTested,
                description: 'Number of fonts tested for dimension fingerprint',
                risk: 'N/A'
            },
            dimensionAvgWidth: {
                value: result.dimensionFingerprint?.stats?.avgWidth?.toFixed(2),
                description: 'Average font width (px)',
                risk: 'N/A'
            },
            dimensionAvgHeight: {
                value: result.dimensionFingerprint?.stats?.avgHeight?.toFixed(2),
                description: 'Average font height (px)',
                risk: 'N/A'
            },
            dimensionWidthVariance: {
                value: result.dimensionFingerprint?.stats?.widthVariance?.toFixed(2),
                description: 'Width variance across tested fonts',
                risk: 'N/A'
            },
            dimensionHeightVariance: {
                value: result.dimensionFingerprint?.stats?.heightVariance?.toFixed(2),
                description: 'Height variance across tested fonts',
                risk: 'N/A'
            },
            
            // === Existing: Emoji fingerprinting ===
            emojiHash: {
                value: result.emojiHash,
                description: 'Emoji rendering stable hash (FNV-1a)',
                risk: 'N/A'
            },
            emojiAvgCoverage: {
                value: result.emojiAggregates?.avgCoverage?.toFixed(4),
                description: 'Average emoji pixel coverage ratio',
                risk: 'N/A'
            },
            emojiAvgWidth: {
                value: result.emojiAggregates?.avgWidth?.toFixed(2),
                description: 'Average emoji text width (px)',
                risk: 'N/A'
            },
            emojiTotalUniqueColors: {
                value: result.emojiAggregates?.totalUniqueColors,
                description: 'Total unique colors across all emojis (quantized)',
                risk: 'N/A'
            },
            emojiTotalFilledPixels: {
                value: result.emojiAggregates?.totalFilledPixels,
                description: 'Total non-transparent pixels across all emojis',
                risk: 'N/A'
            },
            emojiAvgEdgeLike: {
                value: result.emojiAggregates?.avgEdgeLike?.toFixed(0),
                description: 'Average edge-like pixel transitions per emoji',
                risk: 'N/A'
            },
            emojiDpr: {
                value: result.emoji?.dpr,
                description: 'Device pixel ratio used for emoji rendering',
                risk: 'N/A'
            },
            emojiCount: {
                value: result.emoji?.emojiCount,
                description: 'Number of emojis tested',
                risk: 'N/A'
            },
            
            // === Timing metrics ===
            fontTestingMs: {
                value: result.timing?.fontTestingMs,
                description: 'Font detection time (ms)',
                risk: 'N/A'
            },
            platformInferenceMs: {
                value: result.timing?.platformInferenceMs,
                description: 'Platform inference time (ms)',
                risk: 'N/A'
            },
            categoryAnalysisMs: {
                value: result.timing?.categoryAnalysisMs,
                description: 'Category analysis time (ms)',
                risk: 'N/A'
            },
            dimensionFingerprintMs: {
                value: result.timing?.dimensionFingerprintMs,
                description: 'Dimension fingerprinting time (ms)',
                risk: 'N/A'
            },
            emojiMeasurementMs: {
                value: result.timing?.emojiMeasurementMs,
                description: 'Emoji measurement time (ms)',
                risk: 'N/A'
            },
            totalMs: {
                value: result.timing?.totalMs,
                description: 'Total detection time (ms)',
                risk: 'N/A'
            }
        };

        // Add per-emoji detailed metrics if available
        if (result.emojiMetrics && Array.isArray(result.emojiMetrics)) {
            result.emojiMetrics.forEach((em, idx) => {
                const prefix = `emoji_${idx}`;
                metrics[`${prefix}_char`] = {
                    value: em.emoji,
                    description: `Emoji ${idx + 1} character`,
                    risk: 'N/A'
                };
                metrics[`${prefix}_width`] = {
                    value: em.textMetrics?.width?.toFixed(2),
                    description: `Emoji ${idx + 1} measured text width`,
                    risk: 'N/A'
                };
                metrics[`${prefix}_coverage`] = {
                    value: em.bitmapStats?.coverage?.toFixed(4),
                    description: `Emoji ${idx + 1} pixel coverage ratio`,
                    risk: 'N/A'
                };
                metrics[`${prefix}_uniqueColors`] = {
                    value: em.bitmapStats?.uniqueColors,
                    description: `Emoji ${idx + 1} unique colors (quantized 12-bit)`,
                    risk: 'N/A'
                };
                metrics[`${prefix}_filledPixels`] = {
                    value: em.bitmapStats?.filledPixels,
                    description: `Emoji ${idx + 1} non-transparent pixels`,
                    risk: 'N/A'
                };
                metrics[`${prefix}_dHash`] = {
                    value: em.dHash?.hex,
                    description: `Emoji ${idx + 1} perceptual hash (56-bit)`,
                    risk: 'N/A'
                };
            });
        }
        
        // Add dimension details for individual fonts (top variance fonts)
        if (result.dimensionFingerprint?.dimensions && result.dimensionFingerprint.dimensions.length > 0) {
            // Show first 10 font dimensions
            result.dimensionFingerprint.dimensions.slice(0, 10).forEach((dim, idx) => {
                metrics[`fontDim_${idx}_${dim.font.replace(/\s+/g, '_')}`] = {
                    value: `${dim.width}x${dim.height}`,
                    description: `${dim.font} rendered dimensions`,
                    risk: 'N/A'
                };
            });
        }

        return metrics;
    }
}

export { 
    FontsDetector, 
    FONT_LIST, 
    EMOJI_CHARS, 
    PLATFORM_INDICATOR_FONTS, 
    FONT_CATEGORIES, 
    DIMENSION_FINGERPRINT_FONTS 
};
export default FontsDetector;
