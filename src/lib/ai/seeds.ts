// Explicit offline fallback content. Never presented as AI-generated.
// Each row: topic | question | correct answer | three distractors | short fact.
const rows = `Science|What force pulls objects toward Earth?|Gravity|Friction|Magnetism|Buoyancy|Gravity attracts objects with mass.
Science|What is the chemical symbol for gold?|Au|Ag|Fe|Cu|Au comes from the Latin word aurum.
Science|What unit measures electrical resistance?|Ohm|Volt|Watt|Ampere|Resistance is measured in ohms.
Science|Which gas do plants absorb during photosynthesis?|Carbon dioxide|Oxygen|Helium|Hydrogen|Plants use carbon dioxide to make sugars.
Science|Which particle carries a negative electric charge?|Electron|Proton|Neutron|Photon|Electrons have a negative electric charge.
Science|What is the smallest unit of a chemical element?|Atom|Cell|Crystal|Organ|An atom retains an element's chemical identity.
Science|At sea level, water normally boils at which temperature?|100°C|0°C|50°C|200°C|Water boils at 100°C at standard atmospheric pressure.
Science|What instrument measures temperature?|Thermometer|Barometer|Compass|Ruler|A thermometer measures temperature.
Science|Which state of matter has a fixed volume but no fixed shape?|Liquid|Solid|Gas|Plasma|A liquid takes the shape of its container.
Science|What type of energy does a moving object have?|Kinetic|Chemical|Nuclear|Elastic|Kinetic energy is the energy of motion.
Nature and Animals|Which mammal lays eggs?|Platypus|Rabbit|Dolphin|Horse|The platypus is an egg-laying mammal.
Nature and Animals|What do caterpillars develop into?|Butterflies or moths|Beetles|Dragonflies|Spiders|Caterpillars are the larvae of butterflies and moths.
Nature and Animals|Which animal has eight arms?|Octopus|Shark|Crab|Jellyfish|An octopus has eight arms.
Nature and Animals|Which part of a plant usually absorbs water?|Roots|Petals|Fruit|Seeds|Roots absorb water from the soil.
Nature and Animals|What is a group of wolves called?|Pack|Herd|Flock|School|Wolves often live in packs.
Nature and Animals|Which bird is known for its colorful fan-shaped tail?|Peacock|Sparrow|Penguin|Robin|Male peafowl display a colorful train of feathers.
Nature and Animals|Which animal is a marsupial?|Kangaroo|Tiger|Bear|Otter|Kangaroos raise their young in a pouch.
Nature and Animals|Which process turns water vapor into liquid drops?|Condensation|Evaporation|Melting|Freezing|Condensation forms liquid from water vapor.
Nature and Animals|What do bees collect to make honey?|Nectar|Sand|Bark|Salt|Bees transform flower nectar into honey.
Nature and Animals|Which tree produces acorns?|Oak|Pine|Palm|Birch|Acorns are the fruit of oak trees.
Space|Which planet is known as the Red Planet?|Mars|Venus|Jupiter|Mercury|Iron oxide gives Mars its reddish color.
Space|What star is closest to Earth?|The Sun|Sirius|Polaris|Betelgeuse|The Sun is the star at the center of our solar system.
Space|Which planet has the most prominent rings?|Saturn|Earth|Mars|Venus|Saturn's bright rings contain ice and rock.
Space|What is Earth's natural satellite?|The Moon|Titan|Europa|Phobos|The Moon orbits Earth.
Space|What galaxy contains our solar system?|Milky Way|Andromeda|Triangulum|Whirlpool|Our solar system belongs to the Milky Way.
Space|Which planet is closest to the Sun?|Mercury|Venus|Earth|Mars|Mercury has the smallest orbit of the eight planets.
Space|What keeps planets in orbit around the Sun?|Gravity|Sound|Wind|Electric current|Gravity helps keep planets in their orbits.
Space|What is a light-year a measure of?|Distance|Time|Temperature|Mass|A light-year is the distance light travels in a year.
Space|Which object is a comet most likely to develop near the Sun?|A tail|A forest|An ocean|A mountain range|Heating releases gas and dust from a comet.
Space|Who was the first person to walk on the Moon?|Neil Armstrong|Yuri Gagarin|Buzz Aldrin|John Glenn|Neil Armstrong stepped onto the Moon in 1969.
History|Which civilization built the pyramids at Giza?|Ancient Egyptians|Vikings|Incas|Aztecs|The Giza pyramids were built in ancient Egypt.
History|Who is associated with the printing press in fifteenth-century Europe?|Johannes Gutenberg|Isaac Newton|Galileo Galilei|Charles Darwin|Gutenberg developed a movable-type printing system in Europe.
History|Which wall was built across northern China over many centuries?|Great Wall|Berlin Wall|Hadrian's Wall|Wailing Wall|Different Chinese dynasties built sections of the Great Wall.
History|Which city was buried by Vesuvius in 79 CE?|Pompeii|Athens|Paris|London|Vesuvius buried Pompeii under volcanic material.
History|Who painted the ceiling of the Sistine Chapel?|Michelangelo|Monet|Van Gogh|Picasso|Michelangelo painted the chapel ceiling in the sixteenth century.
History|Which empire built the Colosseum?|Roman|Mongol|Ottoman|Persian|The Colosseum was built in ancient Rome.
History|Which ancient people used hieroglyphic writing?|Egyptians|Vikings|Romans|Spartans|Egyptian hieroglyphs used pictorial signs.
History|Who led the first expedition to reach the South Pole?|Roald Amundsen|Christopher Columbus|James Cook|Marco Polo|Amundsen's team reached the South Pole in 1911.
History|Which ship sank during its maiden voyage in 1912?|Titanic|Mayflower|Beagle|Endeavour|The Titanic struck an iceberg in the North Atlantic.
History|Which country gave the Statue of Liberty to the United States?|France|Italy|Spain|Canada|The statue was a gift from France.
Geography|Which ocean is the largest?|Pacific|Atlantic|Indian|Arctic|The Pacific is Earth's largest ocean.
Geography|What is the capital of Japan?|Tokyo|Kyoto|Osaka|Nagoya|Tokyo is Japan's capital.
Geography|Which continent contains the Sahara Desert?|Africa|Asia|Europe|Australia|The Sahara stretches across northern Africa.
Geography|What imaginary line divides Earth into northern and southern hemispheres?|Equator|Prime Meridian|Arctic Circle|Tropic of Cancer|The equator lies at zero degrees latitude.
Geography|Which country is shaped like a boot on maps?|Italy|Greece|Portugal|Norway|Italy's peninsula has a boot-like outline.
Geography|Which river flows through London?|Thames|Seine|Danube|Nile|London stands on the River Thames.
Geography|What is the capital of the Philippines?|Manila|Cebu|Davao|Baguio|Manila is the Philippines' capital.
Geography|Which mountain range contains Mount Everest?|Himalayas|Alps|Andes|Rockies|Everest stands in the Himalayas.
Geography|Which country contains the city of Barcelona?|Spain|France|Portugal|Germany|Barcelona is a city in Spain.
Geography|Which continent is covered by a large ice sheet at the South Pole?|Antarctica|Europe|Africa|South America|Antarctica surrounds the South Pole.
Movies and TV|In The Lion King, what animal is Simba?|Lion|Tiger|Leopard|Wolf|Simba is a lion cub who becomes king.
Movies and TV|Which film features the character Woody the cowboy?|Toy Story|Shrek|Frozen|Cars|Woody is a toy cowboy in Toy Story.
Movies and TV|What is the name of the school in the Harry Potter stories?|Hogwarts|Narnia|Neverland|Rivendell|Hogwarts is a school of witchcraft and wizardry.
Movies and TV|Which superhero is also known as Peter Parker?|Spider-Man|Batman|Superman|Iron Man|Peter Parker is Spider-Man's civilian identity.
Movies and TV|In Finding Nemo, what kind of fish is Nemo?|Clownfish|Goldfish|Angelfish|Swordfish|Nemo and his father are clownfish.
Movies and TV|Which film series features lightsabers?|Star Wars|Jurassic Park|Rocky|The Matrix|Lightsabers are weapons in Star Wars.
Movies and TV|What is a film's screenplay?|Its written script|Its soundtrack|Its ticket|Its projector|A screenplay describes dialogue and scenes.
Movies and TV|Which character lives in a pineapple under the sea?|SpongeBob|Garfield|Snoopy|Scooby-Doo|SpongeBob lives in a pineapple in Bikini Bottom.
Movies and TV|Who directs the actors and overall creative work of a film?|Director|Usher|Ticket seller|Audience member|The director guides a film's creative production.
Movies and TV|What is a documentary mainly intended to present?|Real subjects|Only animation|Only musicals|Only fantasy worlds|Documentaries explore real people, events, or subjects.
Music|How many strings does a standard guitar usually have?|Six|Three|Eight|Twelve|A standard guitar usually has six strings.
Music|Which instrument is played with a bow?|Violin|Trumpet|Flute|Drum|A violin's strings can be played with a bow.
Music|What does tempo describe?|Speed|Loudness|Instrument size|Song title|Tempo describes the speed of the beat.
Music|Which symbol represents a musical note's silence?|Rest|Clef|Sharp|Flat|A rest indicates a period of silence.
Music|Which instrument has black and white keys?|Piano|Guitar|Trombone|Tambourine|Piano keys operate hammers that strike strings.
Music|What is a duet?|Music for two performers|A solo|A silent piece|A tuning device|A duet is performed by two musicians.
Music|Which family includes the trumpet?|Brass|Strings|Keyboards|Percussion|The trumpet belongs to the brass family.
Music|What is a choir?|A group of singers|A drum kit|A guitar brand|A dance step|A choir is an organized group of singers.
Music|What does a conductor guide?|An ensemble|A ticket queue|A paint brush|A camera lens|A conductor coordinates musicians during a performance.
Music|Which instrument commonly uses pedals and strings inside a large frame?|Harp|Flute|Clarinet|Snare drum|A pedal harp uses pedals to change string pitches.
Food and Drink|What is sushi rice traditionally seasoned with?|Rice vinegar|Milk|Coffee|Orange juice|Sushi rice is typically seasoned with rice vinegar.
Food and Drink|Which bean is used to make chocolate?|Cacao|Kidney bean|Soybean|Chickpea|Chocolate is made from cacao beans.
Food and Drink|What makes bread dough rise in many recipes?|Yeast|Salt alone|Vinegar alone|Butter alone|Yeast produces carbon dioxide in dough.
Food and Drink|Which fruit is dried to make raisins?|Grape|Apple|Pear|Peach|Raisins are dried grapes.
Food and Drink|What is tofu primarily made from?|Soybeans|Potatoes|Wheat|Rice|Tofu is made by coagulating soy milk.
Food and Drink|Which spice gives many curries a yellow color?|Turmeric|Cinnamon|Clove|Black pepper|Turmeric contains the yellow pigment curcumin.
Food and Drink|What is the main ingredient in hummus?|Chickpeas|Corn|Apples|Oats|Hummus is commonly made from chickpeas.
Food and Drink|Which drink is made by brewing tea leaves?|Tea|Cocoa|Milk|Lemonade|Tea is prepared by steeping tea leaves in water.
Food and Drink|What is pasta most commonly made from?|Wheat|Cacao|Coffee|Seaweed|Many types of pasta use wheat flour.
Food and Drink|Which food is a source of the oil called olive oil?|Olives|Grapes|Lemons|Dates|Olive oil is extracted from olives.
Sports|How many players per team are on a basketball court during play?|Five|Six|Seven|Eleven|Basketball teams field five players at a time.
Sports|What equipment hits a ball in tennis?|Racket|Bat|Club|Paddle board|Tennis players hit the ball with rackets.
Sports|In which sport is a shuttlecock used?|Badminton|Baseball|Golf|Football|Badminton uses a shuttlecock instead of a ball.
Sports|How many rings appear in the Olympic symbol?|Five|Four|Six|Seven|The Olympic symbol has five interlocking rings.
Sports|Which sport uses wickets?|Cricket|Hockey|Volleyball|Boxing|Wickets are central to cricket.
Sports|What is the length of a standard marathon?|42.195 km|10 km|21 km|50 km|The standard marathon distance is 42.195 kilometers.
Sports|Which sport is played on ice with sticks and a puck?|Ice hockey|Rugby|Squash|Handball|Ice hockey uses a puck on an ice rink.
Sports|In football, which player may handle the ball inside their own penalty area?|Goalkeeper|Striker|Winger|Midfielder|Goalkeepers have special handling rights in their penalty area.
Sports|Which sport involves putting a ball into holes with clubs?|Golf|Tennis|Cricket|Water polo|Golf players use clubs to complete a course.
Sports|What stroke shares its name with an insect in swimming?|Butterfly|Dragonfly|Beetle|Moth|Butterfly is a competitive swimming stroke.
Books and Stories|Who wrote Alice's Adventures in Wonderland?|Lewis Carroll|Jules Verne|Mark Twain|Jane Austen|Lewis Carroll published Alice's Adventures in Wonderland in 1865.
Books and Stories|Which character's nose grows when he lies?|Pinocchio|Peter Pan|Winnie-the-Pooh|Paddington|Pinocchio's growing nose is part of his story.
Books and Stories|What is a book's table of contents used for?|Finding sections|Measuring its weight|Binding its cover|Printing its ink|A table of contents lists a book's sections.
Books and Stories|Which detective lives at 221B Baker Street?|Sherlock Holmes|Hercule Poirot|Nancy Drew|Miss Marple|Sherlock Holmes is associated with 221B Baker Street.
Books and Stories|What is a fable often designed to teach?|A moral|A recipe|A dance|A timetable|Fables often end with a moral lesson.
Books and Stories|Who wrote Pride and Prejudice?|Jane Austen|Emily Brontë|Mary Shelley|Agatha Christie|Jane Austen wrote Pride and Prejudice.
Books and Stories|Which story features a girl visiting her grandmother and a wolf?|Little Red Riding Hood|Cinderella|Rapunzel|Sleeping Beauty|A wolf appears in Little Red Riding Hood.
Books and Stories|What is the person telling a story called?|Narrator|Illustrator|Printer|Bookseller|The narrator provides the story's narration.
Books and Stories|Which bear loves honey in A. A. Milne's stories?|Winnie-the-Pooh|Baloo|Paddington|Yogi|Winnie-the-Pooh is fond of honey.
Books and Stories|What is a biography about?|A person's life|Only fictional animals|A weather forecast|A shopping list|A biography tells the story of someone's life.
Pop Culture|Which video game features blocks, crafting, and Creepers?|Minecraft|Tetris|Pac-Man|Rocket League|Creepers are creatures in Minecraft.
Pop Culture|Which game involves falling shapes called tetrominoes?|Tetris|Chess|Checkers|Sudoku|Tetris uses shapes made of four squares.
Pop Culture|What yellow game character eats dots in a maze?|Pac-Man|Mario|Sonic|Kirby|Pac-Man moves through mazes eating dots.
Pop Culture|What does cosplay mean?|Dressing as a character|Writing software|Collecting stamps|Cooking outdoors|Cosplay combines costume and role-playing.
Pop Culture|Which game series features a hero named Link?|The Legend of Zelda|Halo|Pokémon|Animal Crossing|Link is a central hero in The Legend of Zelda.
Pop Culture|What is Pikachu's type in Pokémon?|Electric|Water|Grass|Rock|Pikachu is an Electric-type Pokémon.
Pop Culture|Which fictional hero uses a shield with a star?|Captain America|Batman|Thor|Hulk|Captain America is known for his shield.
Pop Culture|Which blue video game character is known for running fast?|Sonic|Luigi|Donkey Kong|Pikachu|Sonic the Hedgehog is known for speed.
Pop Culture|What is an emoji?|A small digital pictograph|A computer cable|A file folder|A musical scale|Emoji are pictographs used in digital communication.
Pop Culture|Which board game involves buying properties and collecting rent?|Monopoly|Scrabble|Clue|Risk|Monopoly players buy properties and collect rent.
Art and Design|What are red, blue, and yellow traditionally called in painting?|Primary colors|Pastel colors|Neon colors|Earth tones|Traditional painting color theory uses red, blue, and yellow as primaries.
Art and Design|Which artist painted the Mona Lisa?|Leonardo da Vinci|Claude Monet|Pablo Picasso|Salvador Dalí|Leonardo da Vinci painted the Mona Lisa.
Art and Design|What tool is commonly used to remove pencil marks?|Eraser|Compass|Stapler|Palette|An eraser removes many pencil marks.
Art and Design|Which color results from mixing blue and yellow paint?|Green|Purple|Orange|Red|Blue and yellow paint typically make green.
Art and Design|What is a portrait mainly a picture of?|A person|A map|A building plan|A weather chart|Portraits depict people or their likenesses.
Art and Design|What is sculpture usually?|Three-dimensional art|Only written text|A musical rhythm|A computer protocol|Sculpture creates three-dimensional forms.
Art and Design|What surface does an artist use to mix paints?|Palette|Tripod|Keyboard|Lens|A palette holds and mixes paint.
Art and Design|What does typography concern?|Letter design and arrangement|Cooking methods|Sound waves|Weather patterns|Typography concerns the design and arrangement of type.
Art and Design|Which tool draws circles around a fixed point?|Compass|Ruler|Eraser|Stapler|A drawing compass makes circles and arcs.
Art and Design|What is a landscape painting mainly about?|Scenery|Only faces|Only letters|Only numbers|Landscape paintings depict natural or outdoor scenery.
Technology|What does CPU stand for?|Central processing unit|Computer power utility|Cable processing unit|Central picture upload|A CPU executes computer instructions.
Technology|Which memory holds temporary working data in a computer?|RAM|DVD|Hard drive|USB cable|RAM stores data that a running computer is using.
Technology|What does a web browser primarily display?|Web pages|Only spreadsheets|Only sound waves|Only printer settings|Browsers retrieve and display web content.
Technology|What is a computer's operating system responsible for?|Managing hardware and software|Only charging batteries|Only taking photos|Only printing stickers|Operating systems manage computer resources.
Technology|What does an input device do?|Sends data to a computer|Only stores files|Only displays images|Only provides power|Input devices let people provide information to a computer.
Technology|Which device moves an on-screen pointer?|Mouse|Printer|Speaker|Router|A mouse controls a pointer on a screen.
Technology|What is a backup?|An extra copy of data|A broken screen|A new keyboard|A faster fan|Backups help recover data after loss.
Technology|What does HTTPS add to website communication?|Encryption|Extra pixels|More speakers|A larger keyboard|HTTPS encrypts communication between a browser and a server.
Technology|What does a router help connect?|Networks|Paint colors|Musical notes|Paper sheets|Routers direct data between networks.
Technology|Which unit is made of eight bits?|Byte|Volt|Hertz|Pixel|A byte normally contains eight bits.
General Knowledge|How many sides does a hexagon have?|Six|Five|Seven|Eight|A hexagon is a six-sided polygon.
General Knowledge|What instrument helps you find north?|Compass|Thermometer|Clock|Scale|A compass indicates direction using Earth's magnetic field.
General Knowledge|How many minutes are in an hour?|Sixty|Thirty|Forty|Ninety|An hour contains sixty minutes.
General Knowledge|Which shape has no corners?|Circle|Triangle|Square|Rectangle|A circle has no corners.
General Knowledge|What is the largest organ of the human body?|Skin|Heart|Liver|Lungs|Skin covers and protects the body.
General Knowledge|Which sense uses the tongue to detect flavors?|Taste|Hearing|Sight|Touch|Taste buds help detect flavors.
General Knowledge|What is the opposite direction of east?|West|North|South|Northeast|West is opposite east.
General Knowledge|How many months have exactly thirty days?|Four|Three|Five|Six|April, June, September, and November have thirty days.
General Knowledge|What do you call frozen water?|Ice|Steam|Mist|Dew|Ice is water in its solid state.
General Knowledge|Which tool measures length?|Ruler|Thermometer|Clock|Compass|A ruler measures lengths and distances.
Surprise Mix|What number is the square root of 81?|9|8|7|6|Nine multiplied by itself is eighty-one.
Surprise Mix|How many degrees are in a right angle?|90|45|180|360|A right angle measures ninety degrees.
Surprise Mix|What is half of one hundred?|50|25|10|75|Fifty is half of one hundred.
Surprise Mix|How many faces does a cube have?|6|4|8|12|A cube has six square faces.
Surprise Mix|What is the sum of the interior angles of a triangle?|180 degrees|90 degrees|270 degrees|360 degrees|A plane triangle's interior angles total 180 degrees.
Surprise Mix|What does the prefix kilo mean in metric units?|One thousand|One hundred|One million|One tenth|Kilo represents a factor of one thousand.
Surprise Mix|How many centimeters are in one meter?|100|10|1000|50|One meter contains one hundred centimeters.
Surprise Mix|What is the name of a five-sided polygon?|Pentagon|Hexagon|Octagon|Triangle|A pentagon has five sides.
Surprise Mix|What does a denominator tell you in a fraction?|The number of equal parts|The temperature|The page number|The calendar year|The denominator indicates how many equal parts make a whole.
Surprise Mix|Which of these is an even prime number?|2|3|5|7|Two is the only even prime number.`;
export const seedTrivia = rows.split("\n").map((line, i) => {
  const [topic, question, answer, ...tail] = line.split("|");
  const funFact = tail.pop()!;
  const options = [answer, ...tail];
  const correctIndex = i % 4;
  [options[0], options[correctIndex]] = [options[correctIndex], options[0]];
  return { topic, question, options, correctIndex, funFact };
});
export { seedDaily, seedChoices } from "./content-seeds";
