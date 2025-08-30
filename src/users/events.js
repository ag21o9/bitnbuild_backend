const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../middleware/userMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to validate event data
const validateEventData = (req, res, next) => {
    const { name, description, location, duration, type, eventDate } = req.body;

    if (!name || !description || !location || !duration || !type || !eventDate) {
        return res.status(400).json({
            success: false,
            message: 'All required fields must be provided: name, description, location, duration, type, eventDate'
        });
    }

    // Validate event date
    const date = new Date(eventDate);
    if (isNaN(date.getTime())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid event date format'
        });
    }

    // Event date should be in the future
    if (date < new Date()) {
        return res.status(400).json({
            success: false,
            message: 'Event date must be in the future'
        });
    }

    next();
};

// POST /api/events/create - Create a new fitness event
router.post('/create', authenticateToken, validateEventData, async (req, res) => {
    try {
        const { name, description, location, duration, type, trainer, eventDate } = req.body;
        const creatorId = req.user.id;

        const event = await prisma.event.create({
            data: {
                name,
                description,
                location,
                duration,
                type,
                trainer: trainer || null,
                eventDate: new Date(eventDate),
                creatorId
            },
            include: {
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                registrations: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            data: {
                event
            }
        });

    } catch (error) {
        console.error('Event creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during event creation'
        });
    }
});

// GET /api/events - Get all fitness events
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, type, upcoming } = req.query;
        const skip = (page - 1) * limit;

        let whereCondition = {};

        // Filter by event type if provided
        if (type) {
            whereCondition.type = {
                contains: type,
                mode: 'insensitive'
            };
        }

        // Filter for upcoming events if requested
        if (upcoming === 'true') {
            whereCondition.eventDate = {
                gte: new Date()
            };
        }

        const events = await prisma.event.findMany({
            where: whereCondition,
            include: {
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                registrations: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                eventDate: 'asc'
            },
            skip: parseInt(skip),
            take: parseInt(limit)
        });

        const totalEvents = await prisma.event.count({ where: whereCondition });

        // Add participant count to each event
        const eventsWithParticipantCount = events.map(event => ({
            ...event,
            participantCount: event.registrations.length
        }));

        res.status(200).json({
            success: true,
            message: 'Events retrieved successfully',
            data: {
                events: eventsWithParticipantCount,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalEvents / limit),
                    totalEvents,
                    hasNext: (page * limit) < totalEvents,
                    hasPrev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Events fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching events'
        });
    }
});

// GET /api/events/:id - Get a specific event
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const event = await prisma.event.findUnique({
            where: { id },
            include: {
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                registrations: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Event retrieved successfully',
            data: {
                event: {
                    ...event,
                    participantCount: event.registrations.length
                }
            }
        });

    } catch (error) {
        console.error('Event fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching event'
        });
    }
});

// PUT /api/events/:id - Update event (only creator can update)
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { name, description, location, duration, type, trainer, eventDate } = req.body;

        // Check if event exists and user is the creator
        const existingEvent = await prisma.event.findUnique({
            where: { id }
        });

        if (!existingEvent) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        if (existingEvent.creatorId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the event creator can update this event'
            });
        }

        // Prepare update data
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (location !== undefined) updateData.location = location;
        if (duration !== undefined) updateData.duration = duration;
        if (type !== undefined) updateData.type = type;
        if (trainer !== undefined) updateData.trainer = trainer;
        if (eventDate !== undefined) {
            const date = new Date(eventDate);
            if (isNaN(date.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid event date format'
                });
            }
            if (date < new Date()) {
                return res.status(400).json({
                    success: false,
                    message: 'Event date must be in the future'
                });
            }
            updateData.eventDate = date;
        }

        const updatedEvent = await prisma.event.update({
            where: { id },
            data: updateData,
            include: {
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                registrations: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            message: 'Event updated successfully',
            data: {
                event: updatedEvent
            }
        });

    } catch (error) {
        console.error('Event update error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during event update'
        });
    }
});

// POST /api/events/:id/register - Register for an event
router.post('/:id/register', authenticateToken, async (req, res) => {
    try {
        const { id: eventId } = req.params;
        const userId = req.user.id;

        // Check if event exists
        const event = await prisma.event.findUnique({
            where: { id: eventId }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Check if event is in the future
        if (event.eventDate < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot register for past events'
            });
        }

        // Check if user is already registered
        const existingRegistration = await prisma.eventRegistration.findUnique({
            where: {
                userId_eventId: {
                    userId,
                    eventId
                }
            }
        });

        if (existingRegistration) {
            return res.status(409).json({
                success: false,
                message: 'You are already registered for this event'
            });
        }

        // Create registration
        const registration = await prisma.eventRegistration.create({
            data: {
                userId,
                eventId
            },
            include: {
                event: {
                    include: {
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        res.status(201).json({
            success: true,
            message: 'Successfully registered for the event',
            data: {
                registration
            }
        });

    } catch (error) {
        console.error('Event registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during event registration'
        });
    }
});

// DELETE /api/events/:id/unregister - Unregister from an event
router.delete('/:id/unregister', authenticateToken, async (req, res) => {
    try {
        const { id: eventId } = req.params;
        const userId = req.user.id;

        // Check if registration exists
        const registration = await prisma.eventRegistration.findUnique({
            where: {
                userId_eventId: {
                    userId,
                    eventId
                }
            }
        });

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'You are not registered for this event'
            });
        }

        // Delete registration
        await prisma.eventRegistration.delete({
            where: {
                userId_eventId: {
                    userId,
                    eventId
                }
            }
        });

        res.status(200).json({
            success: true,
            message: 'Successfully unregistered from the event'
        });

    } catch (error) {
        console.error('Event unregistration error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during event unregistration'
        });
    }
});

// GET /api/events/my/created - Get events created by the user
router.get('/my/created', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const events = await prisma.event.findMany({
            where: { creatorId: userId },
            include: {
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                registrations: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                eventDate: 'asc'
            }
        });

        // Add participant count to each event
        const eventsWithParticipantCount = events.map(event => ({
            ...event,
            participantCount: event.registrations.length
        }));

        res.status(200).json({
            success: true,
            message: 'Your created events retrieved successfully',
            data: {
                events: eventsWithParticipantCount,
                total: events.length
            }
        });

    } catch (error) {
        console.error('Created events fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching created events'
        });
    }
});

// GET /api/events/my/registered - Get events user is registered for
router.get('/my/registered', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const registrations = await prisma.eventRegistration.findMany({
            where: { userId },
            include: {
                event: {
                    include: {
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        },
                        registrations: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                event: {
                    eventDate: 'asc'
                }
            }
        });

        res.status(200).json({
            success: true,
            message: 'Your registered events retrieved successfully',
            data: {
                registrations,
                total: registrations.length
            }
        });

    } catch (error) {
        console.error('Registered events fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching registered events'
        });
    }
});

// DELETE /api/events/:id - Delete an event (only creator can delete)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if event exists and user is the creator
        const event = await prisma.event.findUnique({
            where: { id }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        if (event.creatorId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the event creator can delete this event'
            });
        }

        // Delete event (this will also delete all registrations due to cascade)
        await prisma.event.delete({
            where: { id }
        });

        res.status(200).json({
            success: true,
            message: 'Event deleted successfully'
        });

    } catch (error) {
        console.error('Event deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during event deletion'
        });
    }
});

module.exports = router;
