require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const { type } = require('os');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // For JSON data

app.set('view engine', 'ejs');
app.use(cookieParser());

//Connect to MongoDB    
mongoose.connect('mongodb://localhost:27017/user').then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.log(err);
});

const isAuthenticated = (req, res, next) => {
    //check the user in the cookies
    const userDataCookie = req.cookies.userData;
    // console.log(userDataCookie);
    try {
        const userData = userDataCookie && JSON.parse(userDataCookie);
        // console.log(userData);
        if (userData && userData.username) {
            req.userData = userData;
            return next();
        } else {
            res.redirect('/login');
        }
    } catch (error) {
        console.log(error);
    }
}

const isAdmin = (req, res, next) => {
    if (req.userData && req.userData.role === 'admin') {
        return next();
    } else {
        res.send('Forbidden: You do not have access to the page, admin only')
    }
}


const eventSchema = new mongoose.Schema({
    image: {
        type: String,
        required: true
    },
    event_title: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    full_details:{
        type: String,
        required: true
    }
});

const enrollmentSchema = new mongoose.Schema({
    user_id: {
        type: String,
        required: true
    },
    event_id: {
        type: String,
        required: true
    }
});

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true,
        default: "user"
    },
    enrollment: enrollmentSchema
});

const user = mongoose.model('user', userSchema);
const event = mongoose.model('event', eventSchema);

app.get('/', (req, res) => {
    res.render('index',{isAdmin});
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await user.create({
        username,
        email,
        password: hashedPassword
    });
    res.redirect('login');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const userFound = await user.findOne({ email });
    if (!userFound) {
        return res.send('Invalid User Credentials'); // Handle the case where the user doesn't exist
    }

    const passwordMatch = await bcrypt.compare(password, userFound.password);

    if (passwordMatch) {
        //! Create some cookies
        //* prepare login user data
        //? Setting the cookie with the userData
        res.cookie("userData", JSON.stringify({
            username: userFound.username,
            role: userFound.role
        }), {
            maxAge: 3 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: false,
            sameSite: 'strict'
        });
        res.redirect('/');
    } else {
        res.send("Invalid credentials pass");
    }
    // if (userFound && isMatch) {
    //     res.redirect('Events');
    // } else {
    //     res.send('Invalid credentials');
    // }
});

app.get('/addEvent', isAuthenticated, isAdmin, (req, res) => {
    res.render('addEvent');
});

app.post('/addEvent', isAuthenticated, isAdmin, async (req, res) => {
    const { image, event_title, date, location, description, full_details } = req.body;
    try {
        await event.create({
            image,
            event_title,
            date,
            location,
            description,
            full_details
        });
        res.redirect('/Events');
    } catch (error) {
        console.error('Error adding event:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/Events', isAuthenticated, async (req, res) => {
    const username = req.userData ? req.userData.username : null;
    const role = req.userData ? req.userData.role : null;
    const isAdmin = role === 'admin';
    if (username) {
        const currentPage = parseInt(req.query.page) || 1;
        const eventsPerPage = 3; // Number of events to display per page

        try {
            // Get the total count of events
            const totalEvents = await event.countDocuments();

            // Calculate total pages
            const totalPages = Math.ceil(totalEvents / eventsPerPage);

            // Calculate the starting index for the current page
            const startIndex = (currentPage - 1) * eventsPerPage;

            // Fetch the events for the current page
            const events = await event.find()
                .skip(startIndex)
                .limit(eventsPerPage)
                .sort({ date: -1 }); // Sort by date, adjust as needed

            // Render the events with pagination info
            res.render('Events', {
                events,
                currentPage,
                totalPages,
                isAdmin,
                Enrollment
            });
        } catch (error) {
            console.error('Error fetching events:', error);
            res.status(500).send('Internal Server Error');
        }
    } else {
        res.redirect("/login");
    }
});

// Search Events Route
app.get('/search', async (req, res) => {
    const searchTerm = req.query.search || ''; // Get search term from query
    const currentPage = parseInt(req.query.page) || 1;
    const eventsPerPage = 3; // Events per page for pagination

    try {
        // Use a regex to perform a case-insensitive search on event_title
        const query = { event_title: { $regex: searchTerm, $options: 'i' } };
        const totalEvents = await event.countDocuments(query); // Count matching events
        const totalPages = Math.ceil(totalEvents / eventsPerPage); // Calculate total pages

        const events = await event.find(query)
            .skip((currentPage - 1) * eventsPerPage)
            .limit(eventsPerPage)
            .sort({ date: -1 }); // Get matching events for the current page

        // Render the same 'Events' template, but with filtered results
        res.render('Events', {
            events,
            currentPage,
            totalPages,
            isAdmin,
        });
    } catch (error) {
        console.error('Error searching events:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Get Edit Event Form
app.get('/editEvent/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const eventToEdit = await event.findById(id);
        if (eventToEdit) {
            res.render('editEvent', { event: eventToEdit });
        } else {
            res.status(404).send('Event not found');
        }
    } catch (error) {
        console.error('Error fetching event for edit:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Update Event
app.post('/editEvent/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { image, event_title, date, location, description } = req.body;

    try {
        await event.findByIdAndUpdate(id, {
            image,
            event_title,
            date,
            location,
            description
        });
        res.redirect('/Events'); // Redirect to events page after update
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Delete Event
app.post('/deleteEvent/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await event.findByIdAndDelete(id);
        res.redirect('/Events'); // Redirect to events page after deletion
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Event Details Route
app.get('/event/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        const eventDetails = await event.findById(id);
        if (eventDetails) {
            res.render('event-details', { event: eventDetails });
        } else {
            res.status(404).send('Event not found');
        }
    } catch (error) {
        console.error('Error fetching event details:', error);
        res.status(500).send('Internal Server Error');
    }
});



app.get("/logout", (req, res) => {
    //!Logout
    res.clearCookie("userData");
    //redirect
    res.redirect("/login");
});

app.listen(5000, () => {
    console.log('Server running on port 5000');
});