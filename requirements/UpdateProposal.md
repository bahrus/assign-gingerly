# Update Proposal

I've temporarily moved in to the root folder separate packages custom-enhancements and mount-observer as folders, for your reference (and in the case of custom-enhancements, your edits).

custom-enhancements/README.md is my WHATWG proposal, as an issue, which is limited to 65,536 characters (I think), that I would like you to please update. Due to the size limit, I had to stop the issue with the table of contents for more items around (maybe you know or can infer what the size limit is):

## How custom elements can opt in

I have another WHATWG proposal as an issue for mount-observer, which is currently close to what the mount-observer/README.md folder has.

The tricky thing is that what the custom-enhancements proposal supports is 90% assign-gingerly and 10% mount-observer, because custom-enhancements is advocating automatically detecting elements that satisfy the withAttr criteria.

The current custom-elements proposal, which I would like you to significantly modify, was still laboring under the desire to ask the platform to support not only initial parsing of the attributes during the initialization handshake, but also maintaining updates as attributes change.  I think the justification for using attributes to update the enhancements vs updating properties via assign gingerly is too weak to ask the platform to support, so any such mentions can go away, or at least be considered outside the scope of the proposal.

Please do your best to make the custom-enhancements/README.md accurate to what assign-gingerly (and 10% of mount-observer) does, and consise, with lots of links to https://github.com/bahrus/assign-gingerly with bookmarks for more detailed explanations.